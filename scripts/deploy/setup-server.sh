#!/usr/bin/env bash
# =============================================================================================
#  Lethal Recoil — one-time setup of a fresh rented server (Ubuntu 24.04, e.g. Hetzner Cloud)
# =============================================================================================
#
#  What it does, in order (each step can safely run again — it skips what is already done):
#    1. updates Ubuntu and installs a few basic tools
#    2. adds 2 GB of "swap" (spare memory on disk) so building the game never runs out of memory
#    3. turns on automatic security updates
#    4. creates the user "lethal" (log in as this user from now on, not as root) with your SSH key
#    5. makes SSH key-only (no passwords) and turns off root login
#    6. installs Docker (from Docker's official site)
#    7. turns on the firewall: only SSH (22), web (80) and HTTPS (443) are open
#    8. downloads the game code from GitHub (or uses code that was already uploaded)
#    9. writes the settings file deploy/.env (domain + a random dashboard password)
#   10. builds and starts the game server + Caddy (HTTPS) with Docker
#
#  How to run it (as root, on the server, over SSH) — Claude normally does this for you:
#    curl -fsSL https://raw.githubusercontent.com/vasars2024-hub/spaceYZX/claude/new-session-gr9eqy/scripts/deploy/setup-server.sh -o setup-server.sh
#    bash setup-server.sh yourgame.com
#
#  Optional settings (put them before "bash", e.g.  BRANCH=main bash setup-server.sh game.com):
#    APP_USER   login name to create                  (default: lethal)
#    APP_DIR    where the game code lives              (default: /opt/lethal-recoil)
#    DATA_DIR   where the database + backups live      (default: /var/lib/lethal-recoil)
#    REPO_URL   the GitHub repository                  (default: the Lethal Recoil repo)
#    BRANCH     which branch to run                    (default: claude/new-session-gr9eqy)
#    KEEP_ROOT_LOGIN=1   don't turn off root login over SSH
# =============================================================================================

set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
APP_USER="${APP_USER:-lethal}"
APP_DIR="${APP_DIR:-/opt/lethal-recoil}"
DATA_DIR="${DATA_DIR:-/var/lib/lethal-recoil}"
REPO_URL="${REPO_URL:-https://github.com/vasars2024-hub/spaceYZX.git}"
BRANCH="${BRANCH:-claude/new-session-gr9eqy}"
KEEP_ROOT_LOGIN="${KEEP_ROOT_LOGIN:-0}"
# the user inside the game's Docker image ("node") has this number; it must own the data folder
CONTAINER_UID=1000

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die() {
  printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2
  exit 1
}

# ---------------------------------------------------------------------------------------------
# 0. Checks before changing anything
# ---------------------------------------------------------------------------------------------
[ "$(id -u)" -eq 0 ] || die "Run this as root (log in with: ssh root@<server-ip>)."
[ -n "$DOMAIN" ] || die "Tell me the domain, e.g.:  bash setup-server.sh yourgame.com"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
DOMAIN="$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] ||
  die "\"$DOMAIN\" doesn't look like a domain name (example: yourgame.com)."
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "APP_USER \"$APP_USER\" is not a valid user name."
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || warn "This script is made for Ubuntu 24.04 (found: ${PRETTY_NAME:-unknown})."
fi
export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------------------------------------
# 1. Update Ubuntu, install basic tools
# ---------------------------------------------------------------------------------------------
say "1/10 Updating Ubuntu and installing basic tools (takes a minute or two)"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q ca-certificates curl git ufw unattended-upgrades sqlite3 openssl

# ---------------------------------------------------------------------------------------------
# 2. Swap: spare memory on disk, used only if RAM runs out (the game build needs ~1-2 GB)
# ---------------------------------------------------------------------------------------------
say "2/10 Swap file"
if swapon --show | grep -q .; then
  echo "Swap already on."
else
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  echo "2 GB swap added."
fi

# ---------------------------------------------------------------------------------------------
# 3. Automatic security updates (and a restart at 05:00 server time if an update needs one;
#    the game starts again by itself afterwards)
# ---------------------------------------------------------------------------------------------
say "3/10 Automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat >/etc/apt/apt.conf.d/52lethal-recoil-upgrades <<'EOF'
// Lethal Recoil server: reboot automatically (at 05:00) when a security update requires it.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "05:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
echo "On."

# ---------------------------------------------------------------------------------------------
# 4. The everyday user (instead of root), with the same SSH key(s) root has
# ---------------------------------------------------------------------------------------------
say "4/10 User \"$APP_USER\""
if id "$APP_USER" >/dev/null 2>&1; then
  echo "User exists."
else
  useradd --create-home --shell /bin/bash --comment "Lethal Recoil" "$APP_USER"
fi
# '*' = no password can ever work (key login only), without marking the account "locked"
# (SSH refuses locked accounts even with a valid key)
usermod -p '*' "$APP_USER"
USER_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$USER_HOME/.ssh"
touch "$USER_HOME/.ssh/authorized_keys"
if [ -s /root/.ssh/authorized_keys ]; then
  # add root's keys that the user doesn't have yet
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    grep -qxF "$key" "$USER_HOME/.ssh/authorized_keys" || echo "$key" >>"$USER_HOME/.ssh/authorized_keys"
  done </root/.ssh/authorized_keys
fi
chown "$APP_USER:$APP_USER" "$USER_HOME/.ssh/authorized_keys"
chmod 600 "$USER_HOME/.ssh/authorized_keys"
# No password exists for this user (key login only), so allow sudo without one.
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$APP_USER"
chmod 440 "/etc/sudoers.d/90-$APP_USER"
visudo -cf "/etc/sudoers.d/90-$APP_USER" >/dev/null
echo "Log in from now on with:  ssh $APP_USER@<server-ip>"

# ---------------------------------------------------------------------------------------------
# 5. SSH: keys only; no root login (only if the new user really has a key — never lock you out)
# ---------------------------------------------------------------------------------------------
say "5/10 Securing SSH"
if [ -s "$USER_HOME/.ssh/authorized_keys" ]; then
  ROOT_LOGIN="no"
  [ "$KEEP_ROOT_LOGIN" = "1" ] && ROOT_LOGIN="prohibit-password"
  # "01-" so it is read first: in SSH settings the first value wins (e.g. over 50-cloud-init.conf)
  cat >/etc/ssh/sshd_config.d/01-lethal-recoil.conf <<EOF
# Lethal Recoil server: SSH keys only
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin $ROOT_LOGIN
EOF
  mkdir -p /run/sshd # Ubuntu 24.04 starts SSH on demand; the settings test needs this folder
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    echo "Password logins off; root login: $ROOT_LOGIN. (This SSH session stays open.)"
  else
    rm -f /etc/ssh/sshd_config.d/01-lethal-recoil.conf
    warn "SSH settings test failed; left SSH unchanged."
  fi
else
  warn "No SSH key found for root, so SSH was left unchanged (to avoid locking you out)."
fi

# ---------------------------------------------------------------------------------------------
# 6. Docker (official packages from download.docker.com)
# ---------------------------------------------------------------------------------------------
say "6/10 Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker is already installed: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  CODENAME="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker >/dev/null
# the everyday user may run docker commands (update.sh etc.)
usermod -aG docker "$APP_USER"

# ---------------------------------------------------------------------------------------------
# 7. Firewall: allow only SSH, HTTP (for the certificate check + redirect) and HTTPS
# ---------------------------------------------------------------------------------------------
say "7/10 Firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null # HTTP/3
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

# ---------------------------------------------------------------------------------------------
# 8. The game code
# ---------------------------------------------------------------------------------------------
say "8/10 Game code in $APP_DIR"
git config --system --get-all safe.directory 2>/dev/null | grep -qxF "$APP_DIR" ||
  git config --system --add safe.directory "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "Code already here; fetching branch $BRANCH."
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
elif [ -f "$APP_DIR/Dockerfile" ]; then
  echo "Code was uploaded (no git); using it as it is."
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod +x "$APP_DIR"/scripts/deploy/*.sh 2>/dev/null || true

# ---------------------------------------------------------------------------------------------
# 9. Data folder + settings file (the dashboard password is made once and then kept)
# ---------------------------------------------------------------------------------------------
say "9/10 Data folder and settings"
# owned by the game (uid 1000), group = the everyday user; the "2" (setgid) makes new files such
# as backups belong to that group too, so "$APP_USER" can read/download them
install -d -m 2750 -o "$CONTAINER_UID" -g "$APP_USER" "$DATA_DIR"
ENV_FILE="$APP_DIR/deploy/.env"
if [ -f "$ENV_FILE" ]; then
  echo "Keeping the existing settings file; setting DOMAIN=$DOMAIN."
  if grep -q '^DOMAIN=' "$ENV_FILE"; then
    sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" "$ENV_FILE"
  else
    echo "DOMAIN=$DOMAIN" >>"$ENV_FILE"
  fi
else
  cat >"$ENV_FILE" <<EOF
# Lethal Recoil server settings (see deploy/env.example). Keep this file private.
DOMAIN=$DOMAIN
DASHBOARD_TOKEN=$(openssl rand -hex 24)
DATA_DIR=$DATA_DIR
EOF
  echo "Created $ENV_FILE (with a new random dashboard password)."
fi
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------------------------
# 10. Build and start (the first build takes a few minutes)
# ---------------------------------------------------------------------------------------------
say "10/10 Building and starting the game (first time: 3-8 minutes)"
cd "$APP_DIR/deploy"
APP_VERSION="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo server)"
export APP_VERSION
docker compose build game
docker compose up -d

printf 'Waiting for the game server to report "healthy"'
STATE=""
for _ in $(seq 1 60); do
  STATE="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q game)" 2>/dev/null || true)"
  [ "$STATE" = "healthy" ] && break
  printf '.'
  sleep 3
done
echo
[ "$STATE" = "healthy" ] || die "The game server did not become healthy. Look at:  cd $APP_DIR/deploy && docker compose logs game"

# ---------------------------------------------------------------------------------------------
# Done: check DNS + HTTPS and print a summary
# ---------------------------------------------------------------------------------------------
MY_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
say "Done!"
echo "  Server address (IPv4):  $MY_IP"
if [ "$DNS_IP" = "$MY_IP" ]; then
  echo "  DNS:                    $DOMAIN points here. Good."
  if curl -fsS --max-time 60 --retry 6 --retry-delay 10 --retry-all-errors "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo "  HTTPS:                  https://$DOMAIN works."
  else
    warn "HTTPS isn't answering yet. Caddy retries by itself; check again in a few minutes:  curl https://$DOMAIN/health"
  fi
else
  warn "$DOMAIN points to '${DNS_IP:-nothing}', not to $MY_IP. Set the DNS A record to $MY_IP; HTTPS starts working a few minutes after that."
fi
cat <<EOF

  Players join at:   https://$DOMAIN
  Log in from now:   ssh $APP_USER@$MY_IP
  Host dashboard:    on your PC run  scripts\\deploy\\open-dashboard.ps1 -Server $MY_IP
  Update the game:   ssh $APP_USER@$MY_IP "$APP_DIR/scripts/deploy/update.sh"
  Database:          $DATA_DIR/spaceyz.db   (daily backups in $DATA_DIR/backups)

EOF
