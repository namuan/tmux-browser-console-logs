#!/usr/bin/env bash
set -e

SESSION="browser-logs"
DEBUG_PORT=9222
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${1:-about:blank}"

# Ensure npm dependencies
if [ ! -d "$SCRIPT_DIR/node_modules/cloakbrowser" ]; then
  (cd "$SCRIPT_DIR" && npm install) >&2
fi

# Resolve CloakBrowser binary path (auto-downloads ~200MB on first run)
CLOAKBROWSER_BIN=$(cd "$SCRIPT_DIR" && node --input-type=module -e "
  const { ensureBinary } = await import('cloakbrowser');
  process.stdout.write(await ensureBinary());
" | tail -1)

[ -x "$CLOAKBROWSER_BIN" ] || { echo "Error: CloakBrowser binary not found" >&2; exit 1; }

echo "Using CloakBrowser: $CLOAKBROWSER_BIN" >&2
echo "Opening URL: $URL" >&2

# Generate stealth args matching cloakbrowser defaults
FINGERPRINT_SEED=$(( RANDOM % 90000 + 10000 ))
STEALTH_ARGS=("--fingerprint=$FINGERPRINT_SEED")
if [[ "$(uname)" == "Darwin" ]]; then
  STEALTH_ARGS+=("--fingerprint-platform=macos")
else
  STEALTH_ARGS+=("--fingerprint-platform=windows")
fi

# Kill any existing session + stale process
tmux kill-session -t "$SESSION" 2>/dev/null || true
if [ -f /tmp/browser-logs-chromium.pid ]; then
  kill "$(cat /tmp/browser-logs-chromium.pid)" 2>/dev/null || true
  rm -f /tmp/browser-logs-chromium.pid
fi

# Launch CloakBrowser with remote debugging
"$CLOAKBROWSER_BIN" \
  "${STEALTH_ARGS[@]}" \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-port="$DEBUG_PORT" \
  "$URL" >/dev/null 2>&1 &
CHROMIUM_PID=$!
echo $CHROMIUM_PID > /tmp/browser-logs-chromium.pid
disown $CHROMIUM_PID

# Create detached tmux session
tmux new-session -d -s "$SESSION" -x 220 -y 50
tmux rename-window -t "$SESSION" "browser"

tmux send-keys -t "$SESSION:0.0" \
  "cd \"$SCRIPT_DIR\" && printf 'Waiting for CloakBrowser on :%s...\n' $DEBUG_PORT && until curl -sf http://localhost:$DEBUG_PORT/json >/dev/null; do sleep 0.3; done && echo 'Connected. Streaming logs (also writing to logs/ directory)' && node capture.js" Enter

tmux attach-session -t "$SESSION"
