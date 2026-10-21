#!/usr/bin/env bash
# =============================================================================================
#  Lethal Recoil — put a player database (spaceyz.db from the home PC) onto the rented server
# =============================================================================================
#
#  Normally started for you by scripts/deploy/upload-database.ps1 on the Windows PC. By hand:
#    /opt/lethal-recoil/scripts/deploy/import-database.sh ~/spaceyz-upload.db
#
#  Steps: checks the file really is an intact SQLite database -> stops the game server ->
#  keeps the server's current database as data/replaced-<date>.db (nothing is thrown away) ->
#  puts the new one in place -> starts the game server again. Accounts, ratings, match history,
#  reports and bans all come along. The game updates the database layout by itself if needed.
# =============================================================================================

set -euo pipefail

SRC="${1:-$HOME/spaceyz-upload.db}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER_UID=1000

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() {
  printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2
  exit 1
}

cd "$APP_DIR/deploy"
[ -f .env ] || die "deploy/.env is missing. Run scripts/deploy/setup-server.sh first."
DATA_DIR="$(grep -E '^DATA_DIR=' .env | tail -n1 | cut -d= -f2-)"
DATA_DIR="${DATA_DIR:-/var/lib/lethal-recoil}"
SUDO=()
[ "$(id -u)" -eq 0 ] || SUDO=(sudo)

say "Checking $SRC"
[ -f "$SRC" ] || die "File not found: $SRC"
[ "$(head -c 15 "$SRC")" = "SQLite format 3" ] || die "$SRC is not a SQLite database."
CHECK="$(sqlite3 -readonly "$SRC" 'PRAGMA integrity_check;' 2>&1 | head -n1)"
[ "$CHECK" = "ok" ] || die "The database is damaged ($CHECK). Not imported."
PLAYERS="$(sqlite3 -readonly "$SRC" 'SELECT COUNT(*) FROM players;' 2>/dev/null || echo "?")"
echo "Intact. Player accounts in it: $PLAYERS"

say "Stopping the game server"
"${SUDO[@]}" docker compose stop game

say "Replacing the database (the old one is kept)"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
if [ -f "$DATA_DIR/spaceyz.db" ]; then
  "${SUDO[@]}" mv "$DATA_DIR/spaceyz.db" "$DATA_DIR/replaced-$STAMP.db"
  echo "Previous database kept as $DATA_DIR/replaced-$STAMP.db"
fi
# the old database's write-ahead log (if any) belongs to the old file: move it along, so it is
# never applied to the new one
for ext in wal shm; do
  if [ -f "$DATA_DIR/spaceyz.db-$ext" ]; then
    "${SUDO[@]}" mv "$DATA_DIR/spaceyz.db-$ext" "$DATA_DIR/replaced-$STAMP.db-$ext"
  fi
done
"${SUDO[@]}" install -m 640 -o "$CONTAINER_UID" -g "$(stat -c %g "$DATA_DIR")" "$SRC" "$DATA_DIR/spaceyz.db"

say "Starting the game server"
"${SUDO[@]}" docker compose up -d game
for _ in $(seq 1 40); do
  STATE="$("${SUDO[@]}" docker inspect -f '{{.State.Health.Status}}' "$("${SUDO[@]}" docker compose ps -q game)" 2>/dev/null || true)"
  [ "$STATE" = "healthy" ] && break
  sleep 3
done
[ "${STATE:-}" = "healthy" ] || die "The game server isn't healthy. Look at: docker compose logs game"
rm -f "$SRC"
echo "Done: the server now uses the imported database ($PLAYERS accounts)."
