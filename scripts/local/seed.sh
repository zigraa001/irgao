#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT"
echo "[local] Seeding aircraft only (no demo users) ..."
npm run db:seed
