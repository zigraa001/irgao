#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT"
echo "[local] Initializing schema (DB ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}) ..."
npm run db:init
