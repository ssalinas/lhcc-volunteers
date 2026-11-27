#!/usr/bin/env bash
# One-time setup: installs a systemd timer that checks GitHub every 5 minutes and, when `main`
# has new commits, redeploys automatically (via deploy/auto-update.sh -> deploy/setup.sh).
# Run this once after deploy/setup.sh has deployed the app successfully. Safe to re-run.
#
# Usage:   ./deploy/setup-auto-update.sh
# Logs:    journalctl -u lhcc-volunteers-update -f
# Disable: sudo systemctl disable --now lhcc-volunteers-update.timer

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UNIT="lhcc-volunteers-update"

cd "$REPO_DIR"

# The timer runs `git fetch` unattended as root, so origin must be reachable without a prompt.
if ! sudo env GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$REPO_DIR" \
    GIT_TERMINAL_PROMPT=0 git -C "$REPO_DIR" fetch --quiet origin main; then
  cat >&2 <<MSG
error: couldn't 'git fetch origin main' as root without a password prompt.
If the repo is private, give it a read-only GitHub deploy key or use a public HTTPS remote:
  git -C ${REPO_DIR} remote -v
MSG
  exit 1
fi

echo "==> Installing ${UNIT}.service and ${UNIT}.timer"
for ext in service timer; do
  sed "s#/opt/lhcc-volunteers#${REPO_DIR}#g" "$SCRIPT_DIR/${UNIT}.${ext}" | sudo tee "/etc/systemd/system/${UNIT}.${ext}" > /dev/null
done

# Treat what's checked out now as already deployed, so enabling this doesn't trigger a rebuild.
sudo mkdir -p /var/lib/${UNIT}
git rev-parse HEAD | sudo tee /var/lib/${UNIT}/deployed-commit > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now "${UNIT}.timer"

echo "==> Done. Merges to main will deploy within ~5 minutes."
echo "    Next check:  systemctl list-timers ${UNIT}.timer"
echo "    Watch logs:  journalctl -u ${UNIT} -f"
