#!/usr/bin/env bash
# Installs cloudflared and runs it as a systemd service connected to an existing
# Cloudflare Tunnel, using a tunnel token. This assumes the tunnel itself — and its
# public hostname routing (e.g. volunteers.longwoodhillschurch.org -> http://localhost:3000)
# — was already created in the Cloudflare Zero Trust dashboard (Networks -> Tunnels). This
# script only connects this machine to it; it doesn't create or configure the tunnel.
#
# Get the token from the dashboard: Networks -> Tunnels -> your tunnel -> Configure ->
# the install command shown there ends with the token, or copy it directly from the
# "token" field.
#
# Safe to re-run. If cloudflared is already installed and running, this just restarts it.
# To switch to a different tunnel token, first run `sudo cloudflared service uninstall`,
# then re-run this script with the new token.
#
# Usage: ./deploy/setup-cloudflared.sh <tunnel-token>

set -euo pipefail

TOKEN="${1:-}"

if [[ -z "$TOKEN" ]]; then
  cat >&2 <<EOF
Usage: ./deploy/setup-cloudflared.sh <tunnel-token>

  tunnel-token   Token for an existing Cloudflare Tunnel. Find it in the Zero Trust
                 dashboard under Networks -> Tunnels -> your tunnel -> Configure.
                 The tunnel's public hostname route (pointing at this app, e.g.
                 http://localhost:3000) is expected to already be set up there —
                 this script only connects the machine to the tunnel, it doesn't
                 configure routing.
EOF
  exit 1
fi

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

# --- Install/run as a systemd service, connected via the token -------------------------

SERVICE_FILE="/etc/systemd/system/cloudflared.service"

if [[ -f "$SERVICE_FILE" ]]; then
  echo "==> cloudflared service is already installed — restarting it"
  echo "    (to connect to a different tunnel, first run: sudo cloudflared service uninstall)"
  sudo systemctl restart cloudflared
else
  echo "==> Installing cloudflared as a systemd service for this tunnel"
  sudo cloudflared service install "$TOKEN"
fi

sudo systemctl enable cloudflared

sleep 2
if systemctl is-active --quiet cloudflared; then
  echo "==> cloudflared is running. Check the tunnel's public hostname route in the"
  echo "    Zero Trust dashboard for the URL it's now reachable at."
else
  echo "==> cloudflared failed to start. Recent logs:" >&2
  sudo journalctl -u cloudflared -n 50 --no-pager >&2
  exit 1
fi

echo "==> Done."
