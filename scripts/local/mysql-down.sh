#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT/local"
echo "[local] Stopping MySQL ..."
docker compose down
echo "[local] MySQL stopped."
