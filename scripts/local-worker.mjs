import { mkdirSync, openSync } from "node:fs";
import { connect } from "node:net";
import { spawn } from "node:child_process";

export async function ensureLocalWorker() {
  if (!["1", "true"].includes(process.env.INNGEST_DEV?.toLowerCase())) return;
  const workerUrl = new URL(process.env.INNGEST_BASE_URL || "http://localhost:8288");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(workerUrl.hostname)) return;

  function workerRunning() {
    return new Promise((resolve) => {
      const socket = connect({ host: workerUrl.hostname.replace(/\[|\]/g, ""), port: Number(workerUrl.port || 8288) });
      socket.setTimeout(500);
      const finish = (running) => { socket.destroy(); resolve(running); };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
    });
  }

  if (await workerRunning()) return;
  if (!process.env.npm_execpath) throw new Error("Start the app with pnpm dev.");
  mkdirSync("output", { recursive: true });
  const log = openSync("output/local-worker.log", "a");
  const packageManager = process.env.npm_execpath;
  const usesNode = /\.(?:cjs|mjs|js)$/i.test(packageManager);
  // Stay attached to the app session; detached Windows workers were disappearing.
  const worker = spawn(usesNode ? process.execPath : packageManager, [...(usesNode ? [packageManager] : []), "run", "dev:inngest", "--port", workerUrl.port || "8288"], {
    windowsHide: true, stdio: ["inherit", log, log], env: process.env,
  });
  let failure;
  worker.once("error", (error) => { failure = error; });
  worker.once("exit", (code, signal) => { failure = new Error(`Local campaign worker stopped (${signal || code}).`); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (failure) throw failure;
    if (await workerRunning()) { console.log("Local campaign worker ready."); return; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  worker.kill();
  throw new Error("Local campaign worker did not start. Check output/local-worker.log or run pnpm dev:inngest.");
}

export function monitorLocalWorker() {
  let checking = false;
  return setInterval(async () => {
    if (checking) return;
    checking = true;
    try { await ensureLocalWorker(); }
    catch (error) { console.error("Local worker recovery failed:", error.message); }
    finally { checking = false; }
  }, 5_000);
}
