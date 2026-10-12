import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { ensureLocalWorker, monitorLocalWorker } from "./local-worker.mjs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

await ensureLocalWorker();
const monitor = monitorLocalWorker();
// Keep the parent session alive so Windows does not stop its worker on startup exit.
const require = createRequire(import.meta.url);
const web = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true, env: process.env,
});
web.on('error', (error) => { console.error(error.message); process.exit(1); });
web.on('exit', (code) => { clearInterval(monitor); process.exit(code ?? 1); });
