#!/usr/bin/env bash
# Installs and starts a Cloudflare Tunnel that exposes this app to the given hostname.
# Safe to re-run — skips steps that are already done (install, login, tunnel creation,
# DNS route) and just re-applies the config + restarts the service.
#
# Requires a Cloudflare account with the target domain already on Cloudflare DNS.
# The first run needs a one-time interactive browser login (`cloudflared tunnel login`)
# to authorize this machine against your Cloudflare account — there's no way to automate
# that step away.
#
# Usage: ./deploy/setup-cloudflared.sh <hostname> [tunnel-name] [local-port]
# Example: ./deploy/setup-cloudflared.sh volunteers.longwoodhillschurch.org lhcc-volunteers 3000

set -euo pipefail

HOSTNAME="${1:-}"
TUNNEL_NAME="${2:-lhcc-volunteers}"
LOCAL_PORT="${3:-3000}"

if [[ -z "$HOSTNAME" ]]; then
  cat >&2 <<EOF
Usage: ./deploy/setup-cloudflared.sh <hostname> [tunnel-name] [local-port]

  hostname     Public DNS name to route to this app, e.g. volunteers.longwoodhillschurch.org
  tunnel-name  Cloudflare Tunnel name to create/reuse (default: lhcc-volunteers)
  local-port   Local port the app listens on (default: 3000, matches PORT in apps/api/.env)
EOF
  exit 1
fi

CRED_DIR="/etc/cloudflared"
CONFIG_FILE="${CRED_DIR}/config.yml"

# --- Install cloudflared -------------------------------------------------------------

if ! command -v cloudflared &>/dev/null; then
  echo "==> Installing cloudflared"
  CODENAME="$(lsb_release -cs)"
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${CODENAME} main" |
    sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y cloudflared
else
  echo "==> cloudflared already installed ($(cloudflared --version))"
fi

# --- Login (interactive, one-time) ----------------------------------------------------

if [[ ! -f "${HOME}/.cloudflared/cert.pem" ]]; then
  echo "==> Not logged in to Cloudflare yet. A browser authorization link will be printed below —"
  echo "    open it (on any device), log in, and pick the domain that contains ${HOSTNAME}."
  cloudflared tunnel login
else
  echo "==> Already logged in to Cloudflare (${HOME}/.cloudflared/cert.pem exists)"
fi

# --- Create the tunnel (idempotent) ---------------------------------------------------

TUNNEL_ID="$(cloudflared tunnel list -o json | python3 -c "
import json, sys
tunnels = json.load(sys.stdin)
matches = [t['id'] for t in tunnels if t['name'] == '${TUNNEL_NAME}']
print(matches[0] if matches else '')
")"

if [[ -z "$TUNNEL_ID" ]]; then
  echo "==> Creating tunnel '${TUNNEL_NAME}'"
  cloudflared tunnel create "$TUNNEL_NAME"
  TUNNEL_ID="$(cloudflared tunnel list -o json | python3 -c "
import json, sys
tunnels = json.load(sys.stdin)
matches = [t['id'] for t in tunnels if t['name'] == '${TUNNEL_NAME}']
print(matches[0] if matches else '')
")"
  if [[ -z "$TUNNEL_ID" ]]; then
    echo "error: tunnel '${TUNNEL_NAME}' was not found after creation" >&2
    exit 1
  fi
else
  echo "==> Tunnel '${TUNNEL_NAME}' already exists (${TUNNEL_ID})"
fi

CRED_FILE_SRC="${HOME}/.cloudflared/${TUNNEL_ID}.json"
CRED_FILE_DST="${CRED_DIR}/${TUNNEL_ID}.json"

if [[ ! -f "$CRED_FILE_SRC" ]]; then
  echo "error: expected tunnel credentials at ${CRED_FILE_SRC} but they weren't found" >&2
  exit 1
fi

# --- Config -----------------------------------------------------------------------------

echo "==> Writing ${CONFIG_FILE}"
sudo mkdir -p "$CRED_DIR"
sudo cp "$CRED_FILE_SRC" "$CRED_FILE_DST"

TMP_CONFIG="$(mktemp)"
cat > "$TMP_CONFIG" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CRED_FILE_DST}

ingress:
  - hostname: ${HOSTNAME}
    service: http://localhost:${LOCAL_PORT}
  - service: http_status:404
EOF
sudo cp "$TMP_CONFIG" "$CONFIG_FILE"
rm -f "$TMP_CONFIG"

# --- DNS route ----------------------------------------------------------------------------

echo "==> Routing ${HOSTNAME} to this tunnel"
if ! cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 | tee /tmp/cloudflared-route.log; then
  if grep -qi "already exists" /tmp/cloudflared-route.log; then
    echo "    DNS route already exists, continuing"
  else
    echo "error: failed to create DNS route" >&2
    exit 1
  fi
fi
rm -f /tmp/cloudflared-route.log

# --- Install as a systemd service ------------------------------------------------------

if ! systemctl list-unit-files | grep -q '^cloudflared\.service'; then
  echo "==> Installing cloudflared as a systemd service"
  sudo cloudflared service install
else
  echo "==> cloudflared systemd service already installed"
fi

echo "==> Enabling and (re)starting cloudflared"
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared

sleep 2
if systemctl is-active --quiet cloudflared; then
  echo "==> cloudflared is running. ${HOSTNAME} should now reach http://localhost:${LOCAL_PORT}."
else
  echo "==> cloudflared failed to start. Recent logs:" >&2
  sudo journalctl -u cloudflared -n 50 --no-pager >&2
  exit 1
fi

echo "==> Done."
