#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${ROOT:-/opt/intent-loop}"
PROD_APP="${PROD_APP:-$ROOT/app}"
PROD_DATA_DIR="${PROD_DATA_DIR:-$ROOT/data}"
STAGING_APP="${STAGING_APP:-$ROOT/staging-app}"
STAGING_DATA_DIR="${STAGING_DATA_DIR:-$ROOT/staging-data}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-$ROOT/.env.staging.local}"
REPO_URL="${REPO_URL:-https://github.com/SylviaCC1001/IntentLoop.git}"
BRANCH="${1:-${BRANCH:-main}}"
SOURCE_DIR="${SOURCE_DIR:-}"
PORT="${PORT:-3101}"
HOST="${HOST:-127.0.0.1}"
SERVICE="${SERVICE:-intent-loop-staging}"
TMP=""

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cleanup() {
  if [[ -n "$TMP" && -d "$TMP" ]]; then
    rm -rf "$TMP"
  fi
}
trap cleanup ERR INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

require_command git
require_command node
require_command npm
require_command systemctl

mkdir -p "$ROOT" "$STAGING_DATA_DIR" "$STAGING_DATA_DIR/repos" "$STAGING_DATA_DIR/prototypes" "$STAGING_DATA_DIR/appendices"

if [[ ! -f "$STAGING_ENV_FILE" ]]; then
  secret="$(openssl rand -base64 48)"
  {
    echo "DATABASE_URL=$STAGING_DATA_DIR/prd.db"
    echo "SESSION_SECRET=$secret"
    echo "INVITE_CODE=PRD2026"
    echo "DATA_DIR=$STAGING_DATA_DIR"
    echo "MAX_UPLOAD_SIZE_MB=100"
    echo "COOKIE_SECURE=false"
  } > "$STAGING_ENV_FILE"
  chmod 600 "$STAGING_ENV_FILE"
fi

log "Refreshing staging data snapshot"
node <<NODE
const fs = require("fs");
const path = require("path");
const Database = require(path.join("$PROD_APP", "node_modules", "better-sqlite3"));

const source = path.join("$PROD_DATA_DIR", "prd.db");
const target = path.join("$STAGING_DATA_DIR", "prd.db");
fs.mkdirSync(path.dirname(target), { recursive: true });

const db = new Database(source, { readonly: true, fileMustExist: true });
db.backup(target)
  .then(() => db.close())
  .catch((error) => {
    db.close();
    console.error(error);
    process.exit(1);
  });
NODE

for dir in repos prototypes appendices; do
  rm -rf "$STAGING_DATA_DIR/$dir"
  if [[ -d "$PROD_DATA_DIR/$dir" ]]; then
    cp -a "$PROD_DATA_DIR/$dir" "$STAGING_DATA_DIR/$dir"
  else
    mkdir -p "$STAGING_DATA_DIR/$dir"
  fi
done

TMP="$ROOT/staging-release.$$"
rm -rf "$TMP"
if [[ -n "$SOURCE_DIR" ]]; then
  log "Copying staging source from $SOURCE_DIR into $TMP"
  cp -a "$SOURCE_DIR" "$TMP"
  rm -rf "$TMP/.next" "$TMP/node_modules"
else
  log "Cloning $REPO_URL#$BRANCH into $TMP"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TMP"
fi
ln -sfn "$STAGING_ENV_FILE" "$TMP/.env.local"

cd "$TMP"
if git rev-parse --short HEAD >/dev/null 2>&1; then
  log "Staging commit $(git rev-parse --short HEAD)"
else
  log "Staging source has no git metadata"
fi

log "Installing dependencies"
npm ci --prefer-offline --no-audit --no-fund

log "Running staging migrations"
set -a
# shellcheck disable=SC1090
. "$STAGING_ENV_FILE"
set +a
npm run db:migrate

log "Building staging app"
npm run build

backup="$ROOT/staging-app.backup-$(date '+%Y%m%d%H%M%S')"
if [[ -e "$STAGING_APP" ]]; then
  log "Backing up current staging app to $backup"
  mv "$STAGING_APP" "$backup"
fi
log "Activating staging release"
mv "$TMP" "$STAGING_APP"
TMP=""
ln -sfn "$STAGING_ENV_FILE" "$STAGING_APP/.env.local"
chmod 600 "$STAGING_ENV_FILE"

cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=IntentLoop staging Next.js app
After=network.target

[Service]
Type=simple
WorkingDirectory=$STAGING_APP
EnvironmentFile=$STAGING_ENV_FILE
Environment=NODE_ENV=production
Environment=PORT=$PORT
Restart=always
RestartSec=3
ExecStart=/usr/bin/npm run start -- --hostname $HOST -p $PORT

[Install]
WantedBy=multi-user.target
UNIT

log "Restarting $SERVICE on $HOST:$PORT"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE"

log "Verifying staging HTTP"
curl -fsS "http://$HOST:$PORT/login" >/dev/null

log "Pruning old staging app backups"
mapfile -t backups < <(find "$ROOT" -maxdepth 1 -mindepth 1 -type d -name 'staging-app.backup-*' | sort)
if (( ${#backups[@]} > 2 )); then
  for old in "${backups[@]:0:${#backups[@]}-2}"; do
    rm -rf "$old"
  done
fi

log "Staging deploy complete: http://$HOST:$PORT"
