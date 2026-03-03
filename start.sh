#!/usr/bin/env bash
set -e

SESSION="browser-logs"
DEBUG_PORT=9222
CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium-1210/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill any existing session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create detached session — top pane: Chromium
tmux new-session -d -s "$SESSION" -x 220 -y 50 \
  -e "DEBUG_PORT=$DEBUG_PORT"

tmux rename-window -t "$SESSION" "browser"

# Launch Chromium in top pane (kept small: 8 lines)
tmux send-keys -t "$SESSION:0.0" \
  "\"$CHROMIUM\" --remote-debugging-port=$DEBUG_PORT --no-first-run --no-default-browser-check 2>&1" Enter

# Split: bottom pane gets 85% of height — this is where logs stream
tmux split-window -v -t "$SESSION:0" -p 85

# Wait for browser, then start capture (logs automatically written to logs/ directory)
tmux send-keys -t "$SESSION:0.1" \
  "cd \"$SCRIPT_DIR\" && printf 'Waiting for browser on :%s...\n' $DEBUG_PORT && until curl -sf http://localhost:$DEBUG_PORT/json >/dev/null; do sleep 0.3; done && echo 'Connected. Streaming logs (also writing to logs/ directory)' && node capture.js" Enter

tmux attach-session -t "$SESSION"
