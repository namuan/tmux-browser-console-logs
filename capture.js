import CDP from 'chrome-remote-interface';

const ts = () => new Date().toISOString();

async function capture() {
  const client = await CDP();
  const {Network, Runtime, Log} = client;

  await Network.enable();
  await Log.enable();
  await Runtime.enable();

  // Browser-level log entries (CSP violations, deprecations, etc.)
  Log.entryAdded(({entry}) => {
    console.log(`${ts()} [LOG:${entry.level}] ${entry.text}`);
  });

  // Page console.log / console.error / console.warn etc.
  Runtime.consoleAPICalled(({type, args, timestamp}) => {
    const msg = args.map(a => a.value ?? a.description ?? '').join(' ');
    console.log(`${new Date(timestamp).toISOString()} [CONSOLE:${type}] ${msg}`);
  });

  Network.requestWillBeSent(({request, timestamp}) => {
    console.log(`${new Date(timestamp * 1000).toISOString()} [REQ] ${request.method} ${request.url}`);
  });

  Network.responseReceived(({response, timestamp}) => {
    console.log(`${new Date(timestamp * 1000).toISOString()} [RES] ${response.status} ${response.url}`);
  });
}

capture().catch(console.error);