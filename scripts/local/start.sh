#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT"

wait_for_mysql() {
  echo "[local] Checking MySQL at ${DB_HOST}:${DB_PORT} ..."
  for i in $(seq 1 30); do
    if (echo > "/dev/tcp/${DB_HOST}/${DB_PORT}") 2>/dev/null; then
      echo "[local] MySQL ready."
      return 0
    fi
    if [[ $i -eq 1 ]]; then
      echo "[local] MySQL not reachable — starting Docker MySQL (npm run local:mysql-up) ..."
      bash "$(dirname "$0")/mysql-up.sh" || true
    fi
    sleep 2
  done
  echo "[local] ERROR: MySQL not reachable on ${DB_HOST}:${DB_PORT}." >&2
  echo "[local] Run: npm run local:mysql-up && npm run local:init" >&2
  return 1
}

wait_for_mysql
bash "$(dirname "$0")/ensure-zones-db.sh" || true

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  IraGo LOCAL — open this URL (NOT port 3000):"
echo "  →  http://localhost:${PORT}/app.html"
echo "════════════════════════════════════════════════════════════"
echo ""
exec npm start
