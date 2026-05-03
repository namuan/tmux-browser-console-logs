#!/usr/bin/env bash
set -e

SESSION="browser-logs"
PID_FILE="/tmp/browser-logs-chromium.pid"

echo "Stopping tmux session: $SESSION" >&2

# Kill the tmux session if it exists
if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  echo "Session $SESSION stopped" >&2
else
  echo "No session named '$SESSION' is currently running" >&2
fi

# Kill the background Chromium if running
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Chromium stopped" >&2
fi
