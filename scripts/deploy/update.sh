#!/usr/bin/env bash
# =============================================================================================
#  Lethal Recoil — update the game on the rented server to the newest code on GitHub
# =============================================================================================
#
#  Run on the server as the everyday user (or ask Claude to):
#    ssh lethal@<server-ip> /opt/lethal-recoil/scripts/deploy/update.sh
#
#  What happens:
#    1. downloads the newest code of the branch from GitHub (stops here if nothing changed)
#    2. builds the new version WHILE THE OLD ONE KEEPS RUNNING (players notice nothing yet)
#    3. (with --when-idle) waits until no match is being played, at most 60 minutes
#    4. swaps old for new: players see "server restarting", the game is gone for ~5 seconds
#    5. checks the new version is healthy; if not, puts the previous version back by itself
#
#  Options:
#    --when-idle   wait for running matches to finish before restarting
#    --force       rebuild and restart even if the code didn't change
#    --rollback    go back to the version that ran before the last update
#
#  Settings (environment variables): BRANCH (default claude/new-session-gr9eqy)
# =============================================================================================

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="${BRANCH:-claude/new-session-gr9eqy}"
WHEN_IDLE=0
FORCE=0
ROLLBACK=0
for arg in "$@"; do
  case "$arg" in
  --when-idle) WHEN_IDLE=1 ;;
  --force) FORCE=1 ;;
  --rollback) ROLLBACK=1 ;;
  -h | --help)
    sed -n '2,24p' "$0"
    exit 0
    ;;
  *)
    echo "Unknown option: $arg (try --help)" >&2
    exit 1
    ;;
  esac
done

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() {
  printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2
  exit 1
}

cd "$APP_DIR/deploy"
[ -f .env ] || die "deploy/.env is missing. Run scripts/deploy/setup-server.sh first."
# use sudo for docker only if this user isn't allowed to run it directly
DOCKER=(docker)
docker info >/dev/null 2>&1 || DOCKER=(sudo docker)
compose() { "${DOCKER[@]}" compose "$@"; }

# read one setting from deploy/.env
setting() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }

# Is the new container healthy? (waits up to ~2 minutes)
wait_healthy() {
  local id state=""
  for _ in $(seq 1 40); do
    id="$(compose ps -q game)"
    state="$("${DOCKER[@]}" inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || true)"
    [ "$state" = "healthy" ] && return 0
    [ "$state" = "unhealthy" ] && return 1
    sleep 3
  done
  return 1
}

# How many matches are running? Asks the host dashboard (only reachable on this machine).
running_matches() {
  local port token
  port="$(setting DASHBOARD_PORT)"
  port="${port:-7778}"
  token="$(setting DASHBOARD_TOKEN)"
  curl -fsS --max-time 5 -H "Host: localhost:$port" -H "Authorization: Bearer $token" \
    "http://127.0.0.1:$port/api/status" | grep -o '"matches":[0-9]*' | cut -d: -f2
}

wait_for_idle() {
  say "Waiting until no match is running (at most 60 minutes)"
  local n
  for _ in $(seq 1 120); do
    n="$(running_matches || echo "?")"
    if [ "$n" = "0" ]; then
      echo "No matches running."
      return 0
    fi
    echo "  $(date +%H:%M) matches running: $n"
    sleep 30
  done
  echo "Still busy after 60 minutes; updating anyway."
}

# Swap the running game container for the image tagged lethal-recoil:latest
restart_game() {
  say "Restarting the game server (players are told; about 5 seconds offline)"
  compose up -d --no-build game caddy
}

GIT=(git -C "$APP_DIR")

# ---------------------------------------------------------------------------------------------
# --rollback: back to the version before the last update
# ---------------------------------------------------------------------------------------------
if [ "$ROLLBACK" = "1" ]; then
  [ -f "$APP_DIR/.deploy-previous" ] || die "No earlier version recorded."
  PREV="$(cat "$APP_DIR/.deploy-previous")"
  say "Going back to version $PREV"
  "${DOCKER[@]}" image inspect lethal-recoil:previous >/dev/null 2>&1 ||
    die "The previous image is gone; run: BRANCH=... $0 --force after fixing the code."
  "${DOCKER[@]}" tag lethal-recoil:previous lethal-recoil:latest
  "${GIT[@]}" reset --quiet --hard "$PREV"
  restart_game
  wait_healthy || die "The previous version is not healthy either. Look at: docker compose logs game"
  echo "Back on $PREV."
  exit 0
fi

# ---------------------------------------------------------------------------------------------
# 1. Newest code
# ---------------------------------------------------------------------------------------------
say "Checking GitHub for a newer version (branch $BRANCH)"
BEFORE="$("${GIT[@]}" rev-parse HEAD)"
"${GIT[@]}" fetch --quiet origin "$BRANCH"
AFTER="$("${GIT[@]}" rev-parse "origin/$BRANCH")"
if [ "$BEFORE" = "$AFTER" ] && [ "$FORCE" = "0" ]; then
  echo "Already up to date ($(git -C "$APP_DIR" rev-parse --short HEAD)). Nothing to do. (--force rebuilds anyway)"
  exit 0
fi
echo "Updating $(git -C "$APP_DIR" rev-parse --short "$BEFORE") -> $(git -C "$APP_DIR" rev-parse --short "$AFTER"):"
"${GIT[@]}" log --oneline --no-decorate "$BEFORE..$AFTER" | head -n 15 | sed 's/^/    /'
# deploy/.env is not part of git, so this keeps the settings and the dashboard password
"${GIT[@]}" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
"${GIT[@]}" reset --quiet --hard "origin/$BRANCH"

# ---------------------------------------------------------------------------------------------
# 2. Build while the old version keeps running
# ---------------------------------------------------------------------------------------------
say "Building the new version (the old one keeps running meanwhile)"
if "${DOCKER[@]}" image inspect lethal-recoil:latest >/dev/null 2>&1; then
  "${DOCKER[@]}" tag lethal-recoil:latest lethal-recoil:previous
fi
echo "$BEFORE" >"$APP_DIR/.deploy-previous"
APP_VERSION="$("${GIT[@]}" rev-parse --short HEAD)"
export APP_VERSION
if ! compose build game; then
  "${GIT[@]}" reset --quiet --hard "$BEFORE"
  die "The build failed, so nothing was changed; the old version is still running."
fi

# ---------------------------------------------------------------------------------------------
# 3.-5. Wait (optional), swap, check
# ---------------------------------------------------------------------------------------------
[ "$WHEN_IDLE" = "1" ] && wait_for_idle
restart_game
if wait_healthy; then
  say "Updated to $APP_VERSION and healthy."
  # tidy up old image layers (keeps lethal-recoil:previous for --rollback)
  "${DOCKER[@]}" image prune -f >/dev/null || true
else
  say "The new version is NOT healthy — putting the previous one back"
  compose logs --tail 40 game || true
  if "${DOCKER[@]}" image inspect lethal-recoil:previous >/dev/null 2>&1; then
    "${DOCKER[@]}" tag lethal-recoil:previous lethal-recoil:latest
    "${GIT[@]}" reset --quiet --hard "$BEFORE"
    restart_game
    wait_healthy && die "Rolled back to $(git -C "$APP_DIR" rev-parse --short HEAD). Fix the problem, then update again."
  fi
  die "Rollback failed too. Look at: cd $APP_DIR/deploy && docker compose logs game"
fi
