#!/usr/bin/env bash
# Shared env for all scripts/local/* wrappers.
# Main scripts in scripts/ are unchanged — we only export vars before calling them.

LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export LOCAL_ROOT

# Default local MySQL (matches local/docker-compose.yml)
export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_PORT="${DB_PORT:-3307}"
export DB_USER="${DB_USER:-irago}"
export DB_PASSWORD="${DB_PASSWORD:-irago_local}"
export DB_NAME="${DB_NAME:-irago}"
export DB_DEBUG="${DB_DEBUG:-false}"
export PORT="${PORT:-3002}"

LOCAL_ENV_FILE="$LOCAL_ROOT/local/.env.local"
if [[ -f "$LOCAL_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
fi

# Root .env (AUTH_SECRET, SMTP) — optional; dotenv in Node also loads it
if [[ -f "$LOCAL_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ROOT/.env"
  set +a
  # Local DB overrides win over production-ish .env DB_* values
  if [[ -f "$LOCAL_ENV_FILE" ]]; then
    set -a
    source "$LOCAL_ENV_FILE"
    set +a
  fi
fi

export DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_DEBUG PORT
export ZONES_DB_NAME="${ZONES_DB_NAME:-irago_zones}"
