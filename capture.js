import CDP from 'chrome-remote-interface';
import { createWriteStream, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = 'logs';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 10;
const ts = () => new Date().toISOString();

function getLogFilePath() {
  return join(LOGS_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
}

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function cleanupOldLogs() {
  const files = readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => join(LOGS_DIR, f))
    .map(path => ({ path, mtime: statSync(path).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  for (let i = MAX_FILES; i < files.length; i++) {
    unlinkSync(files[i].path);
  }
}

let currentLogPath = null;
let logStream = null;

function rotateLogIfNeeded() {
  if (!logStream || !currentLogPath) return;

  const stats = statSync(currentLogPath);
  if (stats.size >= MAX_LOG_SIZE) {
    logStream.end();
    logStream = null;
    currentLogPath = null;

    ensureLogsDir();
    cleanupOldLogs();

    currentLogPath = getLogFilePath();
    logStream = createWriteStream(currentLogPath, { flags: 'w' });
    logStream.on('error', console.error);
  }
}

function initializeLogging() {
  ensureLogsDir();
  cleanupOldLogs();
  currentLogPath = getLogFilePath();
  logStream = createWriteStream(currentLogPath, { flags: 'w' });
  logStream.on('error', console.error);
}

function writeLog(message) {
  rotateLogIfNeeded();
  if (logStream) {
    logStream.write(message + '\n');
  }
}

async function capture() {
  initializeLogging();

  // List all available targets and connect to the first page
  const targets = await CDP.List();
  const pageTarget = targets.find(t => t.type === 'page');
  
  if (!pageTarget) {
    console.error('No page target found. Make sure you have at least one browser tab/window open.');
    process.exit(1);
  }

  console.log(`Connecting to target: ${pageTarget.title || pageTarget.url}`);
  
  const client = await CDP({ target: pageTarget });
  const { Network, Runtime, Log } = client;

  await Network.enable();
  await Log.enable();
  await Runtime.enable();

  Log.entryAdded(({ entry }) => {
    const msg = `${ts()} [LOG:${entry.level}] ${entry.text}`;
    console.log(msg);
    writeLog(msg);
  });

  Runtime.consoleAPICalled(({ type, args, timestamp }) => {
    const msg = args.map(a => {
      if (a.value !== undefined) return String(a.value);
      if (a.description !== undefined) return a.description;
      if (a.preview) return a.preview.description || JSON.stringify(a.preview);
      return JSON.stringify(a);
    }).join(' ');
    const formatted = `${new Date(timestamp).toISOString()} [CONSOLE:${type}] ${msg}`;
    console.log(formatted);
    writeLog(formatted);
  });

  Runtime.exceptionThrown(({ exceptionDetails, timestamp }) => {
    const { exception, text, stackTrace, url, lineNumber, columnNumber } = exceptionDetails;
    
    let errorMsg = text || 'Unknown error';
    
    // Extract exception details if available
    if (exception) {
      if (exception.description) {
        errorMsg = exception.description;
      } else if (exception.value !== undefined) {
        errorMsg = String(exception.value);
      }
    }
    
    // Add location info if available
    const location = url ? ` at ${url}:${lineNumber}:${columnNumber}` : '';
    
    // Format stack trace if available
    let stackInfo = '';
    if (stackTrace && stackTrace.callFrames && stackTrace.callFrames.length > 0) {
      stackInfo = '\n  ' + stackTrace.callFrames
        .map(frame => `at ${frame.functionName || '(anonymous)'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`)
        .join('\n  ');
    }
    
    const formatted = `${new Date(timestamp).toISOString()} [EXCEPTION] ${errorMsg}${location}${stackInfo}`;
    console.log(formatted);
    writeLog(formatted);
  });

  console.log('✓ Console logging enabled');
  console.log('✓ Network monitoring enabled');
  console.log('✓ Browser logs enabled');
  console.log('✓ Exception tracking enabled');
  console.log('\nWaiting for events...\n');

  Network.requestWillBeSent(({ request, timestamp }) => {
    const formatted = `${new Date(timestamp * 1000).toISOString()} [REQ] ${request.method} ${request.url}`;
    console.log(formatted);
    writeLog(formatted);
  });

  Network.responseReceived(({ response, timestamp }) => {
    const formatted = `${new Date(timestamp * 1000).toISOString()} [RES] ${response.status} ${response.url}`;
    console.log(formatted);
    writeLog(formatted);
  });
}

capture().catch(console.error);