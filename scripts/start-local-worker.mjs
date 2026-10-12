import { existsSync, mkdirSync, openSync } from "node:fs";
import { connect } from "node:net";
import { spawn } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

if (!['1', 'true'].includes(process.env.INNGEST_DEV?.toLowerCase())) process.exit(0);
const workerUrl = new URL(process.env.INNGEST_BASE_URL || "http://localhost:8288");
if (!['localhost', '127.0.0.1', '[::1]'].includes(workerUrl.hostname)) process.exit(0);

function workerRunning() {
  return new Promise((resolve) => {
    const socket = connect({ host: workerUrl.hostname.replace(/\[|\]/g, ''), port: Number(workerUrl.port || 8288) });
    socket.setTimeout(500);
    const finish = (running) => { socket.destroy(); resolve(running); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

if (await workerRunning()) process.exit(0);
if (!process.env.npm_execpath) throw new Error("Start the app with pnpm dev.");
mkdirSync('output', { recursive: true });
const log = openSync('output/local-worker.log', 'a');
const packageManager = process.env.npm_execpath;
const usesNode = /\.(?:cjs|mjs|js)$/i.test(packageManager);
const worker = spawn(usesNode ? process.execPath : packageManager, [...(usesNode ? [packageManager] : []), 'run', 'dev:inngest'], {
  detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env,
});
worker.on('error', (error) => { console.error('Local campaign worker could not start:', error.message); process.exit(1); });
worker.unref();
for (let attempt = 0; attempt < 60; attempt += 1) {
  if (await workerRunning()) { console.log('Local campaign worker ready.'); process.exit(0); }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error('Local campaign worker did not start. Check output/local-worker.log or run pnpm dev:inngest.');
