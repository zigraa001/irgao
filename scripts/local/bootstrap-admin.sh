#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

cd "$LOCAL_ROOT"
if [[ -z "${ADMIN_PASSWORD:-}" ]] || [[ ${#ADMIN_PASSWORD} -lt 6 ]]; then
  echo "[local] Set ADMIN_PASSWORD (min 6 chars) in local/.env.local first." >&2
  exit 1
fi
echo "[local] Bootstrapping admin ${ADMIN_USER:-admin@irago.com} ..."
npm run admin:bootstrap
