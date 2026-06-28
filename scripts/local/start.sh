#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT"
echo "[local] Starting IraGo on http://localhost:${PORT} (DB ${DB_HOST}:${DB_PORT}) ..."
exec npm start
