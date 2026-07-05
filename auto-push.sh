#!/bin/bash
# Temporary auto-pusher for the in-flight ralph run.
# Pushes new commits on the current branch to origin every 90s
# while the ralph.sh supervisor (given PID) is still alive.
SUPERVISOR_PID="${1:?usage: auto-push.sh <ralph_supervisor_pid>}"
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

while kill -0 "$SUPERVISOR_PID" 2>/dev/null; do
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -n "$BRANCH" ] && [ -n "$(git log --oneline "origin/$BRANCH..HEAD" 2>/dev/null)" ]; then
    echo "[$(date -u +%H:%M:%S)] pushing $BRANCH..."
    git push origin "$BRANCH" 2>&1 | tail -1
  fi
  sleep 90
done
# Final push after the loop exits
git push origin "$(git rev-parse --abbrev-ref HEAD)" 2>&1 | tail -1
echo "[$(date -u +%H:%M:%S)] supervisor $SUPERVISOR_PID gone — auto-pusher exiting."
