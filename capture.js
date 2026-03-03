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

  const client = await CDP();
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
    const msg = args.map(a => a.value ?? a.description ?? '').join(' ');
    const formatted = `${new Date(timestamp).toISOString()} [CONSOLE:${type}] ${msg}`;
    console.log(formatted);
    writeLog(formatted);
  });

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