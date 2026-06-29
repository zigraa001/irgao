#!/usr/bin/env bash
# Create irago_zones database on an existing local Docker MySQL volume (idempotent).
set -euo pipefail
source "$(dirname "$0")/lib/env.sh"

CONTAINER="${LOCAL_MYSQL_CONTAINER:-irago-mysql-local}"
SQL_FILE="$LOCAL_ROOT/local/sql/docker-init/02-zones-database.sql"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "[local] Ensuring zones database (${ZONES_DB_NAME:-irago_zones}) ..."
  docker exec -i "$CONTAINER" mysql -uroot -proot < "$SQL_FILE"
else
  echo "[local] MySQL container not running — zones DB will be created on first mysql-up."
fi
