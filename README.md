# tmux-browser-console-logs

Stream browser console logs and network traffic into a tmux session using the Chrome DevTools Protocol (CDP).

## Requirements

- [Node.js](https://nodejs.org) (v18+)
- [tmux](https://github.com/tmux/tmux)
- A Chromium-based browser with remote debugging support

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Chromium binary

If you don't have one, use Playwright to download it:

```bash
npx playwright install chromium
```

Find the binary path:

```bash
ls ~/Library/Caches/ms-playwright/
```

The binary will be at a path like:

```
~/Library/Caches/ms-playwright/chromium-XXXX/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

Update the `CHROMIUM` variable in `start.sh` to match your version number.

### 3. Launch the tmux session

```bash
./start.sh
```

This will:

1. Kill any existing `browser-logs` tmux session
2. Open Chromium with `--remote-debugging-port=9222` in the top pane
3. Wait until the browser is ready, then start streaming logs in the bottom pane

## Layout

```
┌─────────────────────────────────────┐
│  Chromium (remote-debugging:9222)   │
├─────────────────────────────────────┤
│  Waiting for browser...             │
│  Connected. Streaming logs...       │
│  2026-03-03T... [REQ] GET https://  │
│  2026-03-03T... [CONSOLE:log] hello │
│  2026-03-03T... [RES] 200 https://  │
└─────────────────────────────────────┘
```

## Log format

Each line is prefixed with an ISO timestamp and a tag:

| Tag | Source |
|-----|--------|
| `[LOG:error]` / `[LOG:warning]` | Browser-level entries (CSP violations, deprecations) |
| `[CONSOLE:log]` / `[CONSOLE:warn]` / `[CONSOLE:error]` | Direct `console.*` calls from page scripts |
| `[REQ] METHOD url` | Outgoing network request |
| `[RES] status url` | Network response received |

## Log files

Logs are automatically written to the `logs/` directory in the project root. The log file management includes:

- **Timestamped files**: Each log file is named with an ISO 8601 timestamp (e.g., `logs/2026-03-03T12-30-45.log`)
- **Size-based rotation**: A new log file is created when the current file reaches 10 MB
- **Retention limit**: Only the 10 most recent log files are kept; older files are automatically deleted
- **Dedicated directory**: All log files are stored in the `logs/` directory

No manual configuration is needed—the `capture.js` script handles all log rotation and cleanup automatically when it starts.

## Using your own browser

You can connect to any running Chromium-based browser (Chrome, Vivaldi, Edge, etc.) as long as it was launched with `--remote-debugging-port=9222`.

**Important:** if the browser is already running, quit it first — otherwise the new instance hands off to the existing one and the debug flag is ignored.

```bash
# Vivaldi example
~/Applications/Vivaldi.app/Contents/MacOS/Vivaldi --remote-debugging-port=9222
```

Then run just the capture script directly (without `start.sh`):

```bash
node capture.js
```

Verify the debug endpoint is reachable before connecting:

```bash
curl http://localhost:9222/json
```

## Tmux controls

| Key | Action |
|-----|--------|
| `Ctrl-b d` | Detach from session (leaves it running) |
| `Ctrl-b [` | Scroll mode (use arrow keys, `q` to exit) |
| `tmux attach -t browser-logs` | Re-attach to a detached session |
| `tmux kill-session -t browser-logs` | Stop everything |
