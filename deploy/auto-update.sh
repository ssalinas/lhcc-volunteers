#!/usr/bin/env bash
# Polls origin/main and, when it has moved past what's deployed, runs deploy/setup.sh to
# pull/build/migrate/restart. Run by the lhcc-volunteers-update.timer systemd unit every few
# minutes (installed once by deploy/setup-auto-update.sh) — you don't normally run this by hand,
# but it's safe to: `sudo ./deploy/auto-update.sh`.
#
# State lives in /var/lib/lhcc-volunteers-update/:
#   deployed-commit  last commit setup.sh deployed successfully
#   failed-commit    last commit setup.sh failed on — not retried until main moves again, so a
#                    broken merge doesn't rebuild on the Pi every five minutes. Fix it by merging
#                    a fix to main (or run ./deploy/setup.sh by hand to see the error).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="/var/lib/lhcc-volunteers-update"
mkdir -p "$STATE_DIR"

# The repo is owned by the app's run user (setup.sh chowns it), but this runs as root — tell git
# that's fine. Passed via env (not `git config --global`) so setup.sh's own git calls inherit it.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0="$REPO_DIR"

cd "$REPO_DIR"

git fetch --quiet origin main
remote="$(git rev-parse origin/main)"

# First run: whatever is checked out is what's running.
[[ -f "$STATE_DIR/deployed-commit" ]] || git rev-parse HEAD > "$STATE_DIR/deployed-commit"
deployed="$(cat "$STATE_DIR/deployed-commit")"
failed="$(cat "$STATE_DIR/failed-commit" 2>/dev/null || true)"

if [[ "$remote" == "$deployed" ]]; then
  exit 0
fi
if [[ "$remote" == "$failed" ]]; then
  echo "origin/main (${remote:0:7}) failed to deploy earlier — waiting for a new commit on main."
  exit 0
fi

echo "==> New commit on main: ${deployed:0:7} -> ${remote:0:7}"
git log --oneline "${deployed}..${remote}" 2>/dev/null | head -20 || true

if "$SCRIPT_DIR/setup.sh"; then
  echo "$remote" > "$STATE_DIR/deployed-commit"
  rm -f "$STATE_DIR/failed-commit"
  echo "==> Auto-update to ${remote:0:7} succeeded."
else
  echo "$remote" > "$STATE_DIR/failed-commit"
  echo "==> Auto-update to ${remote:0:7} FAILED — see the log above. Won't retry this commit." >&2
  exit 1
fi
