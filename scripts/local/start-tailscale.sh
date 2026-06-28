#!/usr/bin/env bash
# Start IraGo with Tailscale admin gate enabled (uses local/.env.local).
set -euo pipefail
DIR="$(dirname "$0")"
# shellcheck source=lib/env.sh
source "$DIR/lib/env.sh"

export ADMIN_REQUIRE_TAILSCALE=true
export ADMIN_TAILSCALE_ALLOW_LOCAL=true
export TRUST_PROXY=true

cd "$LOCAL_ROOT"
echo "[local] Tailscale admin mode — ADMIN_REQUIRE_TAILSCALE=true"
echo "[local] In another terminal: npm run local:tailscale"
echo "[local] http://localhost:${PORT}/app.html (admin API allowed on loopback)"
exec npm start
