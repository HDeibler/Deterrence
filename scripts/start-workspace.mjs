import { spawn } from 'node:child_process';
import net from 'node:net';

const APP_PORT_START = Number.parseInt(process.env.PORT ?? '4173', 10);
const APP_PORT_MAX = APP_PORT_START + 20;
const appPort = await findAvailablePort(APP_PORT_START, APP_PORT_MAX);
const serverPort = Number.parseInt(process.env.SERVER_PORT ?? '3000', 10);
const clientOrigin = process.env.CLIENT_ORIGIN ?? `http://localhost:${appPort}`;

if (appPort !== APP_PORT_START) {
  console.log(`[deterrence] Port ${APP_PORT_START} is busy. Starting app on ${appPort} instead.`);
}
console.log(`[deterrence] App URL: http://localhost:${appPort}`);
console.log(`[deterrence] API URL: http://localhost:${serverPort}`);

const concurrently = spawn(
  'npx',
  [
    'concurrently',
    '--names',
    'app,server',
    '--prefix-colors',
    'cyan,magenta',
    'npm run start -w deterrence-app',
    'npm run start -w deterrence-server',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(appPort),
      CLIENT_ORIGIN: clientOrigin,
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    concurrently.kill(signal);
  });
}

concurrently.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

async function findAvailablePort(start, max) {
  for (let port = start; port <= max; port += 1) {
    if (await canBind(port)) {
      return port;
    }
  }
  throw new Error(`No available port found between ${start} and ${max}`);
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}
