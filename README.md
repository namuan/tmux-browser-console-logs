# tmux-browser-console-logs

Stream browser console logs, network traffic, and JavaScript exceptions into a tmux session using the Chrome DevTools Protocol (CDP).

## Requirements

- [Node.js](https://nodejs.org) (v18+)
- [tmux](https://github.com/tmux/tmux)
- A Chromium-based browser with remote debugging support

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Launch

```bash
./start.sh "https://example.com"
```

If you don't have a Chromium binary, `start.sh` will automatically download one via `npx playwright install chromium`.

If no URL is given, the browser opens `about:blank`.

This will:

1. Kill any existing `browser-logs` tmux session and stale Chromium process
2. Launch Chromium with `--remote-debugging-port=9222` as a background process (PID saved to `/tmp/browser-logs-chromium.pid`)
3. Create a detached tmux session with a single pane running `capture.js`
4. Wait until the browser is ready, then start streaming logs

## Layout

```
┌─────────────────────────────────────┐
│  tmux session "browser-logs"        │
│  ┌───────────────────────────────┐  │
│  │ Waiting for browser...        │  │
│  │ Connected. Streaming logs...  │  │
│  │ 2026-03-03T... [REQ] GET ...  │  │
│  │ 2026-03-03T... [CONSOLE:log]  │  │
│  │ 2026-03-03T... [RES] 200 ...  │  │
│  │ 2026-03-03T... [EXCEPTION]    │  │
│  │ 2026-03-03T... [RES:BODY]     │  │
│  └───────────────────────────────┘  │
│                                     │
│  Chromium (background process)      │
└─────────────────────────────────────┘
```

Chromium runs as a background process **outside** of tmux. The tmux session contains a single pane running the capture script.

## Log format

Each line is prefixed with an ISO timestamp and a tag:

| Tag | Source |
|-----|--------|
| `[LOG:level]` | Browser-level entries (CSP violations, deprecations, etc.) — level is `error`, `warning`, `info`, `verbose`, etc. |
| `[CONSOLE:type]` | Direct `console.*` calls from page scripts — type is `log`, `warn`, `error`, `debug`, `info`, `trace`, `assert`, `count`, `timeEnd`, etc. |
| `[REQ] METHOD url` | Outgoing network request, with request headers and POST body (if any) |
| `[RES] status url` | Network response received, with response headers |
| `[RES:BODY] requestId` | Response body content (for non-binary MIME types; truncated at 10 KB) |
| `[EXCEPTION] message` | Uncaught JavaScript exceptions with stack trace and source location |

### Body capture details

- Response bodies are fetched for MIME types other than `image`, `video`, `audio`, `font`, and `octet-stream`
- Body content is truncated at 10 KB with a note about remaining bytes
- Binary bodies that fail UTF-8 decoding are reported as `(binary, N bytes base64)`
- POST data is logged inline with `[REQ]` entries

## Log files

Logs are automatically written to the `logs/` directory in the project root. The log file management includes:

- **Timestamped files**: Each log file is named with an ISO 8601 timestamp (e.g., `logs/2026-03-03T12-30-45.log`)
- **Size-based rotation**: A new log file is created when the current file reaches 10 MB
- **Retention limit**: Only the 10 most recent log files are kept; older files are automatically deleted on startup and during rotation
- **Dedicated directory**: All log files are stored in the `logs/` directory

No manual configuration is needed—the `capture.js` script handles all log rotation and cleanup automatically.

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

## Stopping

```bash
./stop.sh
```

Or manually:

```bash
tmux kill-session -t browser-logs
kill "$(cat /tmp/browser-logs-chromium.pid)"
```

## Tmux controls

| Key | Action |
|-----|--------|
| `Ctrl-b d` | Detach from session (leaves it running) |
| `Ctrl-b [` | Scroll mode (use arrow keys, `q` to exit) |
| `tmux attach -t browser-logs` | Re-attach to a detached session |
| `tmux kill-session -t browser-logs` | Stop everything |
