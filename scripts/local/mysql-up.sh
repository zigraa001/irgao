#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib/env.sh
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT/local"
echo "[local] Starting MySQL (port ${DB_PORT}) ..."
docker compose up -d mysql

echo "[local] Waiting for MySQL ..."
for i in $(seq 1 30); do
  if docker compose exec -T mysql mysqladmin ping -hirago -pirago_local --silent 2>/dev/null; then
    echo "[local] MySQL ready."
    exit 0
  fi
  sleep 2
done
echo "[local] ERROR: MySQL did not become ready in time." >&2
exit 1
