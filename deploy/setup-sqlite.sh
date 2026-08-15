#!/usr/bin/env bash
# Installs SQLite and its build prerequisites on the Pi, and provisions the app's data
# directory. Run this once before the first ./deploy/setup.sh — safe to re-run.
#
# The app itself doesn't link against a system SQLite; `better-sqlite3` (an npm
# dependency) bundles and compiles its own copy during `npm install`. This script covers
# the parts that aren't automatic:
#   - the `sqlite3` CLI, for inspecting the database or restoring a backup by hand
#     (`sqlite3 data/lhcc.sqlite ".backup ..."` / `.restore`)
#   - build tools (`build-essential`, `python3`), needed if npm can't fetch a prebuilt
#     `better-sqlite3` binary for this Pi's architecture/Node version and has to
#     compile from source
#   - the `data/` directory at the repo root, owned by the `lhcc` service user — the
#     systemd unit runs with `ProtectSystem=strict` and only
#     `ReadWritePaths=<repo>/data` writable, so this needs to exist with the right
#     ownership before the service's first start
#
# Usage: ./deploy/setup-sqlite.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUN_USER="lhcc"
DATA_DIR="${REPO_DIR}/data"

echo "==> Setting up SQLite for ${REPO_DIR}"

# --- sqlite3 CLI + native build prerequisites -------------------------------------------

PACKAGES=()
command -v sqlite3 &>/dev/null || PACKAGES+=(sqlite3)
dpkg -s build-essential &>/dev/null || PACKAGES+=(build-essential)
command -v python3 &>/dev/null || PACKAGES+=(python3)

if [[ ${#PACKAGES[@]} -gt 0 ]]; then
  echo "==> Installing: ${PACKAGES[*]}"
  sudo apt-get update
  sudo apt-get install -y "${PACKAGES[@]}"
else
  echo "==> sqlite3 CLI and build prerequisites already installed"
fi

echo "==> sqlite3 CLI version: $(sqlite3 --version)"

# --- Data directory -----------------------------------------------------------------------

if [[ ! -d "$DATA_DIR" ]]; then
  echo "==> Creating ${DATA_DIR}"
  mkdir -p "$DATA_DIR"
else
  echo "==> ${DATA_DIR} already exists"
fi

if id "$RUN_USER" &>/dev/null; then
  echo "==> Setting ${RUN_USER}:${RUN_USER} ownership on ${DATA_DIR}"
  sudo chown -R "${RUN_USER}:${RUN_USER}" "$DATA_DIR"
else
  echo "==> System user \"${RUN_USER}\" doesn't exist yet — skipping ownership change."
  echo "    Create it (sudo useradd -r -s /usr/sbin/nologin ${RUN_USER}) and re-run this"
  echo "    script, or just run ./deploy/setup.sh first, which creates and chowns it too."
fi

echo "==> Done."
