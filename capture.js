import CDP from 'chrome-remote-interface';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = 'logs';
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_BODY_LENGTH = 10 * 1024;
const SKIP_BODY_MIME = new Set(['image', 'video', 'audio', 'font', 'octet-stream']);

const ts = () => new Date().toISOString();
const fmtHeader = ([k, v]) => `  ${k}: ${v}`;

function formatHeaders(h) {
  return h && Object.keys(h).length ? Object.entries(h).map(fmtHeader).join('\n') : '';
}

function formatBody(body, base64) {
  if (!body) return '(empty)';
  try {
    const text = base64 ? Buffer.from(body, 'base64').toString('utf8') : body;
    return text.length > MAX_BODY_LENGTH
      ? text.slice(0, MAX_BODY_LENGTH) + `\n... [truncated, ${text.length - MAX_BODY_LENGTH} more bytes]`
      : text;
  } catch {
    return `(binary, ${body.length} bytes base64)`;
  }
}

export function newLogPath() {
  return join(LOGS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
}

function cleanup() {
  if (!existsSync(LOGS_DIR)) return;
  const files = readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => join(LOGS_DIR, f))
    .map(p => ({ path: p, mtime: statSync(p).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  files.slice(MAX_FILES).forEach(f => unlinkSync(f.path));
}

let stream, path;

function initStream() {
  mkdirSync(LOGS_DIR, { recursive: true });
  cleanup();
  path = newLogPath();
  stream = createWriteStream(path, { flags: 'w' }).on('error', () => {});
  return stream;
}

function write(msg) {
  if (!stream) initStream();
  else if (statSync(path).size >= MAX_LOG_SIZE) { stream.end(); stream = null; initStream(); }
  stream.write(msg + '\n');
}

async function capture() {
  const targets = await CDP.List();
  const target = targets.find(t => t.type === 'page');

  if (!target) {
    console.error('No page target found.');
    process.exit(1);
  }

  console.log(`Connecting: ${target.title || target.url}`);

  const client = await CDP({ target });
  const { Network, Runtime, Log } = client;

  await Network.enable();
  await Log.enable();
  await Runtime.enable();

  const log = msg => { console.log(msg); write(msg); };

  Log.entryAdded(({ entry }) =>
    log(`${ts()} [LOG:${entry.level}] ${entry.text}`));

  Runtime.consoleAPICalled(({ type, args, timestamp }) => {
    const msg = args.map(a => {
      if (a.value !== undefined) return String(a.value);
      if (a.description) return a.description;
      if (a.preview) return a.preview.description || JSON.stringify(a.preview);
      return JSON.stringify(a);
    }).join(' ');
    log(`${new Date(timestamp).toISOString()} [CONSOLE:${type}] ${msg}`);
  });

  Runtime.exceptionThrown(({ exceptionDetails, timestamp }) => {
    const { exception, text, stackTrace, url, lineNumber, columnNumber } = exceptionDetails;
    const msg = exception?.description || String(exception?.value ?? text ?? 'Unknown error');
    const loc = url ? ` at ${url}:${lineNumber}:${columnNumber}` : '';
    const stack = stackTrace?.callFrames?.length
      ? '\n  ' + stackTrace.callFrames.map(f => `at ${f.functionName || '(anonymous)'} (${f.url}:${f.lineNumber}:${f.columnNumber})`).join('\n  ')
      : '';
    log(`${new Date(timestamp).toISOString()} [EXCEPTION] ${msg}${loc}${stack}`);
  });

  console.log('✓ Logging, network, console, exceptions enabled\nWaiting for events...\n');

  Network.requestWillBeSent(({ request, timestamp }) => {
    const hdrs = formatHeaders(request.headers);
    const body = request.postData ? `\n  POST body:\n${formatBody(request.postData)}` : '';
    log(`${new Date(timestamp * 1000).toISOString()} [REQ] ${request.method} ${request.url}${hdrs ? '\n' + hdrs : ''}${body}`);
  });

  Network.responseReceived(({ response, timestamp, requestId }) => {
    const hdrs = formatHeaders(response.headers);
    log(`${new Date(timestamp * 1000).toISOString()} [RES] ${response.status} ${response.statusText || ''} ${response.url}${hdrs ? '\n' + hdrs : ''}`);

    const mime = response.mimeType?.split('/')[0];
    if (mime && !SKIP_BODY_MIME.has(mime)) {
      Network.getResponseBody({ requestId }).then(({ body, base64Encoded }) =>
        log(`${new Date(timestamp * 1000).toISOString()} [RES:BODY] ${requestId}\n${formatBody(body, base64Encoded)}`)
      ).catch(() => {});
    }
  });
}

capture().catch(console.error);