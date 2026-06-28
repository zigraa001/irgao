#!/usr/bin/env bash
# Expose IraGo through Tailscale Serve (HTTPS on your tailnet).
# Run after: npm run local:start  (server must be listening on PORT)
set -euo pipefail
DIR="$(dirname "$0")"
# shellcheck source=lib/env.sh
source "$DIR/lib/env.sh"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "[tailscale] ERROR: tailscale CLI not found. Install: https://tailscale.com/download"
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "[tailscale] ERROR: Tailscale is not connected. Run: tailscale up"
  exit 1
fi

UPSTREAM="http://127.0.0.1:${PORT}"
echo "[tailscale] Serving ${UPSTREAM} on your tailnet (HTTPS) ..."

# Reset prior serve config for a clean start
tailscale serve reset 2>/dev/null || true

tailscale serve --bg --https=443 "$UPSTREAM"

DNS="$(tailscale status --json 2>/dev/null | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try {
      const j=JSON.parse(d);
      const name=j.Self?.DNSName||'';
      process.stdout.write(name.replace(/\.$/,''));
    } catch { process.stdout.write(''); }
  });
" 2>/dev/null || true)"

echo ""
echo "[tailscale] Admin panel (Tailscale required when ADMIN_REQUIRE_TAILSCALE=true):"
if [[ -n "$DNS" ]]; then
  echo "  https://${DNS}/app.html"
else
  echo "  https://<your-machine>.ts.net/app.html  (run: tailscale status)"
fi
echo ""
echo "  Stop: npm run local:tailscale-stop"
tailscale serve status 2>/dev/null || true
