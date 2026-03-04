#!/usr/bin/env bash
set -e

SESSION="browser-logs"

echo "Stopping tmux session: $SESSION" >&2

# Kill the tmux session if it exists
if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  echo "Session $SESSION stopped" >&2
else
  echo "No session named '$SESSION' is currently running" >&2
fi
