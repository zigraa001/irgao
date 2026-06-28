#!/usr/bin/env bash
set -euo pipefail
DIR="$(dirname "$0")"
# shellcheck source=lib/env.sh
source "$DIR/lib/env.sh"

LOCAL_ENV="$LOCAL_ROOT/local/.env.local"
EXAMPLE="$LOCAL_ROOT/local/.env.local.example"

if [[ ! -f "$LOCAL_ENV" ]]; then
  cp "$EXAMPLE" "$LOCAL_ENV"
  echo "[local] Created local/.env.local — edit ADMIN_PASSWORD before bootstrap."
fi

if [[ ! -f "$LOCAL_ROOT/.env" ]]; then
  cp "$LOCAL_ROOT/.env.example" "$LOCAL_ROOT/.env"
  echo "[local] Created .env from .env.example"
fi

cd "$LOCAL_ROOT"
npm run env:gen 2>/dev/null || true

bash "$DIR/mysql-up.sh"
bash "$DIR/init-db.sh"
bash "$DIR/seed.sh"

echo ""
echo "[local] Setup complete."
echo "  1. Edit local/.env.local → set ADMIN_PASSWORD"
echo "  2. npm run local:bootstrap"
echo "  3. npm run local:start  →  http://localhost:${PORT}/app.html"
