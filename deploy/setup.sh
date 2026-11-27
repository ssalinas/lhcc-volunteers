#!/usr/bin/env bash
# Deploys/updates the LHCC Volunteers app on this machine (meant for the Raspberry Pi, but
# only assumes a Debian-ish Linux with systemd). Safe to re-run — this is also the update
# script: pulls main, installs deps, migrates the DB, builds, installs/refreshes the
# systemd unit, and restarts the service.
#
# Ownership model: the app — and everything that writes into the repo (npm ci, migrations,
# seed, build) — runs as the "lhcc" system user, which owns the whole checkout. Root is only
# used for git (so root's credentials/deploy key are used, same as deploy/auto-update.sh),
# chown, and systemd. Never run npm in this checkout as root or as yourself: npm runs package
# install scripts as the directory's owner, so mixed ownership leaves native modules like
# better-sqlite3 half-installed ("Could not locate the bindings file").
#
# First-time use still needs one manual step (see README.md "Deploying to a Raspberry Pi"):
# fill in apps/api/.env — the first run creates it from .env.example and stops.
#
# Usage: ./deploy/setup.sh   (re-runs itself with sudo if needed)
#
# To have merges to main deploy themselves, run ./deploy/setup-auto-update.sh once afterwards —
# it installs a systemd timer that runs this script whenever main changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="lhcc-volunteers"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="lhcc"
# lhcc's home: npm's cache and node-gyp's headers live here (a system user has no home by default).
RUN_HOME="/var/lib/${SERVICE_NAME}"

if [[ $EUID -ne 0 ]]; then
  exec sudo --preserve-env=PATH "$0" "$@"
fi

# The checkout is owned by lhcc but git runs as root here — tell git that's fine. Via env, not
# `git config --global`, so nothing on the machine changes.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0="$REPO_DIR"

cd "$REPO_DIR"
echo "==> Deploying LHCC Volunteers from ${REPO_DIR}"

# --- Sanity checks -----------------------------------------------------------

if [[ ! -d .git ]]; then
  echo "error: ${REPO_DIR} is not a git repository" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: uncommitted changes in ${REPO_DIR} — commit, stash, or discard them first:" >&2
  git status --short >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node isn't on root's PATH. Install Node 20+ system-wide (e.g. NodeSource apt packages)." >&2
  exit 1
fi
NODE_BIN="$(readlink -f "$NODE_BIN")"
NODE_DIR="$(dirname "$NODE_BIN")"

# --- Run user -----------------------------------------------------------------

if ! id "$RUN_USER" &>/dev/null; then
  echo "==> Creating system user ${RUN_USER}"
  useradd --system --home-dir "$RUN_HOME" --shell /usr/sbin/nologin "$RUN_USER"
fi
mkdir -p "$RUN_HOME"
chown "${RUN_USER}:${RUN_USER}" "$RUN_HOME"

# Runs a command as lhcc with a usable HOME/npm cache and the same node root found above.
as_app() {
  sudo -u "$RUN_USER" env HOME="$RUN_HOME" npm_config_cache="${RUN_HOME}/.npm" \
    PATH="${NODE_DIR}:/usr/local/bin:/usr/bin:/bin" "$@"
}

if ! as_app node --version &>/dev/null; then
  cat >&2 <<EOF
error: ${NODE_BIN} isn't runnable by the ${RUN_USER} user (is it installed under someone's home
directory, e.g. via nvm?). Install Node system-wide so ${RUN_USER} can run it.
EOF
  exit 1
fi

# --- .env check ----------------------------------------------------------------

ENV_FILE="apps/api/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> No ${ENV_FILE} found — creating one from .env.example"
  cp .env.example "$ENV_FILE"
  SECRET="$(openssl rand -base64 32)"
  sed -i "s#^BETTER_AUTH_SECRET=.*#BETTER_AUTH_SECRET=${SECRET}#" "$ENV_FILE"
  chown "${RUN_USER}:${RUN_USER}" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  cat <<EOF

A new ${ENV_FILE} was created with a generated BETTER_AUTH_SECRET.
Edit it now to fill in BETTER_AUTH_URL, TRUSTED_ORIGINS, SEED_ADMIN_EMAIL/PASSWORD,
and (optionally) GOOGLE_CLIENT_ID/SECRET and the R2_* backup variables, then re-run
this script:
  sudo \${EDITOR:-nano} ${REPO_DIR}/${ENV_FILE}
EOF
  exit 0
fi

# The service resolves a relative DATABASE_PATH against its WorkingDirectory (the repo root),
# but `npm run db:migrate -w apps/api` runs from apps/api/ — so resolve it here the way the
# service does, or migrations/seed would quietly go to a different database file
# (apps/api/data/) than the one the app actually serves.
DB_PATH="$(grep -E '^DATABASE_PATH=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"'" || true)"
DB_PATH="${DB_PATH:-./data/lhcc.sqlite}"
[[ "$DB_PATH" == /* ]] || DB_PATH="${REPO_DIR}/${DB_PATH#./}"
export DATABASE_PATH="$DB_PATH"
echo "==> Database: ${DATABASE_PATH}"

# --- Pull latest main ----------------------------------------------------------

echo "==> Pulling latest main"
git checkout main
git pull --ff-only origin main

# --- Install, migrate, build ----------------------------------------------------

# Everything from here until systemd writes into the checkout, so it all runs as lhcc, which must
# own the whole tree first (git just wrote files as root; an older run may have left root-owned
# node_modules behind).
echo "==> Setting ${RUN_USER}:${RUN_USER} ownership on ${REPO_DIR}"
chown -R "${RUN_USER}:${RUN_USER}" "$REPO_DIR"
mkdir -p "$(dirname "$DATABASE_PATH")"
chown "${RUN_USER}:${RUN_USER}" "$(dirname "$DATABASE_PATH")"

echo "==> Installing dependencies as ${RUN_USER} (builds native modules for this machine)"
# `npm ci`, not `npm install`: it installs exactly what package-lock.json says and never rewrites
# it, so the checkout stays clean — a lockfile rewritten on the Pi would trip the "uncommitted
# changes" check above and block every later deploy, including unattended ones from
# deploy/auto-update.sh.
as_app npm ci

echo "==> Applying database migrations"
as_app npm run db:migrate -w apps/api

echo "==> Ensuring the seed admin account exists (no-op if already created)"
as_app npm run db:seed -w apps/api

echo "==> Building production bundle"
as_app npm run build

# --- systemd unit ------------------------------------------------------------------

echo "==> Ensuring the systemd unit is installed and up to date"
TMP_UNIT="$(mktemp)"
sed -e "s#/opt/lhcc-volunteers#${REPO_DIR}#g" -e "s#/usr/bin/node#${NODE_BIN}#g" \
  "${REPO_DIR}/deploy/${SERVICE_NAME}.service" > "$TMP_UNIT"

if [[ ! -f "$SERVICE_FILE" ]] || ! cmp -s "$TMP_UNIT" "$SERVICE_FILE"; then
  echo "    installing/updating ${SERVICE_FILE}"
  cp "$TMP_UNIT" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
else
  echo "    already up to date"
fi
rm -f "$TMP_UNIT"

# --- (Re)start ----------------------------------------------------------------------

echo "==> Restarting ${SERVICE_NAME}"
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "==> ${SERVICE_NAME} is running."
else
  echo "==> ${SERVICE_NAME} failed to start. Recent logs:" >&2
  journalctl -u "$SERVICE_NAME" -n 50 --no-pager >&2
  exit 1
fi

echo "==> Done."
