#!/usr/bin/env bash
set -euo pipefail
if ! command -v tailscale >/dev/null 2>&1; then
  echo "[tailscale] tailscale CLI not installed."
  exit 0
fi
echo "[tailscale] Resetting Tailscale Serve ..."
tailscale serve reset
echo "[tailscale] Done."
