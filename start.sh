#!/usr/bin/env bash
set -e

SESSION="browser-logs"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${1:-about:blank}"  # Default to about:blank if no URL provided

# Function to find the latest Chromium version
find_chromium() {
  local playwright_cache="$HOME/Library/Caches/ms-playwright"
  
  # Find all chromium directories and sort by version number
  local latest_dir=$(ls -1d "$playwright_cache"/chromium-* 2>/dev/null | sort -V | tail -n1)
  
  if [ -z "$latest_dir" ]; then
    echo "No Playwright Chromium found. Installing..." >&2
    npx playwright install chromium
    latest_dir=$(ls -1d "$playwright_cache"/chromium-* 2>/dev/null | sort -V | tail -n1)
  fi
  
  # Try different possible paths (different Playwright versions use different structures)
  local chromium_paths=(
    "$latest_dir/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    "$latest_dir/chrome-mac/Chromium.app/Contents/MacOS/Chromium"
    "$latest_dir/chrome-linux/chrome"
  )
  
  for path in "${chromium_paths[@]}"; do
    if [ -f "$path" ]; then
      echo "$path"
      return 0
    fi
  done
  
  echo "Error: Could not find Chromium executable in $latest_dir" >&2
  exit 1
}

CHROMIUM=$(find_chromium)
echo "Using Chromium: $CHROMIUM" >&2
echo "Opening URL: $URL" >&2

# Kill any existing session
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create detached session — top pane: Chromium
tmux new-session -d -s "$SESSION" -x 220 -y 50 \
  -e "DEBUG_PORT=$DEBUG_PORT"

tmux rename-window -t "$SESSION" "browser"

# Launch Chromium in top pane (kept small: 8 lines)
tmux send-keys -t "$SESSION:0.0" \
  "\"$CHROMIUM\" --remote-debugging-port=$DEBUG_PORT --no-first-run --no-default-browser-check \"$URL\" 2>&1" Enter

# Split: bottom pane gets 85% of height — this is where logs stream
tmux split-window -v -t "$SESSION:0" -p 85

# Wait for browser, then start capture (logs automatically written to logs/ directory)
tmux send-keys -t "$SESSION:0.1" \
  "cd \"$SCRIPT_DIR\" && printf 'Waiting for browser on :%s...\n' $DEBUG_PORT && until curl -sf http://localhost:$DEBUG_PORT/json >/dev/null; do sleep 0.3; done && echo 'Connected. Streaming logs (also writing to logs/ directory)' && node capture.js" Enter

tmux attach-session -t "$SESSION"
