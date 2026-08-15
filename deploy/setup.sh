#!/usr/bin/env bash
# Deploys/updates the LHCC Volunteers app on this machine (meant for the Raspberry Pi, but
# only assumes a Debian-ish Linux with systemd). Safe to re-run — this is also the update
# script: pulls main, installs deps, migrates the DB, builds, installs/refreshes the
# systemd unit, and restarts the service.
#
# First-time use still needs a couple of one-off manual steps this script won't do for
# you (see README.md "Deploying to a Raspberry Pi"):
#   - create the system user this app runs as:  sudo useradd -r -s /usr/sbin/nologin lhcc
#   - fill in apps/api/.env (copy from .env.example) with real secrets
#
# Usage: ./deploy/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVICE_NAME="lhcc-volunteers"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
RUN_USER="lhcc"

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

if ! id "$RUN_USER" &>/dev/null; then
  cat >&2 <<EOF
error: system user "${RUN_USER}" doesn't exist yet. Create it once, then re-run this script:
  sudo useradd -r -s /usr/sbin/nologin ${RUN_USER}
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
  cat <<EOF

A new ${ENV_FILE} was created with a generated BETTER_AUTH_SECRET.
Edit it now to fill in BETTER_AUTH_URL, TRUSTED_ORIGINS, SEED_ADMIN_EMAIL/PASSWORD,
and (optionally) GOOGLE_CLIENT_ID/SECRET and the R2_* backup variables, then re-run
this script:
  \${EDITOR:-nano} ${REPO_DIR}/${ENV_FILE}
EOF
  exit 0
fi

# --- Pull latest main ----------------------------------------------------------

echo "==> Pulling latest main"
git checkout main
git pull --ff-only origin main

# --- Install, migrate, build ----------------------------------------------------

echo "==> Installing dependencies (rebuilds native modules for this machine)"
npm install

echo "==> Applying database migrations"
npm run db:migrate -w apps/api

echo "==> Ensuring the seed admin account exists (no-op if already created)"
npm run db:seed -w apps/api

echo "==> Building production bundle"
npm run build

# --- Ownership -------------------------------------------------------------------

echo "==> Setting ${RUN_USER}:${RUN_USER} ownership on ${REPO_DIR}"
sudo chown -R "${RUN_USER}:${RUN_USER}" "$REPO_DIR"

# --- systemd unit ------------------------------------------------------------------

echo "==> Ensuring the systemd unit is installed and up to date"
TMP_UNIT="$(mktemp)"
sed "s#/opt/lhcc-volunteers#${REPO_DIR}#g" "${REPO_DIR}/deploy/${SERVICE_NAME}.service" > "$TMP_UNIT"

if [[ ! -f "$SERVICE_FILE" ]] || ! cmp -s "$TMP_UNIT" "$SERVICE_FILE"; then
  echo "    installing/updating ${SERVICE_FILE}"
  sudo cp "$TMP_UNIT" "$SERVICE_FILE"
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
else
  echo "    already up to date"
fi
rm -f "$TMP_UNIT"

# --- (Re)start ----------------------------------------------------------------------

echo "==> Restarting ${SERVICE_NAME}"
sudo systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "==> ${SERVICE_NAME} is running."
else
  echo "==> ${SERVICE_NAME} failed to start. Recent logs:" >&2
  sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager >&2
  exit 1
fi

echo "==> Done."
