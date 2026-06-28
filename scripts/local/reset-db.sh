#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

CONTAINER="${LOCAL_MYSQL_CONTAINER:-irago-mysql-local}"
SQL_FILE="$LOCAL_ROOT/local/sql/reset.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "[local] Missing $SQL_FILE" >&2
  exit 1
fi

echo "[local] Running local/sql/reset.sql on ${CONTAINER} ..."
docker exec -i "$CONTAINER" mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$SQL_FILE"
echo "[local] Database wiped. Run: npm run local:seed && npm run local:bootstrap"
