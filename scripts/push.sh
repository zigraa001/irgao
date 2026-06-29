#!/usr/bin/env bash
# Push to GitHub using the token in .push-token.env (gitignored).
# Usage: bash scripts/push.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TOKEN_FILE=".push-token.env"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "Missing $TOKEN_FILE. Create it with: GH_TOKEN=<your-token>" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$TOKEN_FILE"; set +a

if [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN is empty. Paste your token into $TOKEN_FILE first." >&2
  exit 1
fi

REMOTE_URL=$(git remote get-url origin)
USER=$(printf '%s' "$REMOTE_URL" | sed -nE 's#.*github\.com[:/]([^/]+)/.*#\1#p')
[ -z "$USER" ] && USER="zigraa001"

echo "Pushing as $USER to origin/main..."
git -c credential.helper= -c "http.https://github.com/.extraheader=Authorization: Basic $(printf '%s' "$USER:$GH_TOKEN" | base64)" push origin main

echo "Done."
