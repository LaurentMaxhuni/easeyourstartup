import { spawn } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const projectRoot = resolve(import.meta.dirname, "..");
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) throw new Error("LOCALAPPDATA is not set.");

const logDir = join(localAppData, "EaseYourStartup", "dev-logs");
mkdirSync(logDir, { recursive: true });

function isListening(port) {
  return new Promise((resolveConnection) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (listening) => {
      socket.destroy();
      resolveConnection(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isListening(port)) return true;
    await delay(500);
  }
  return isListening(port);
}

function startService(name, command, args, logName, options = {}) {
  const logPath = join(logDir, logName);
  const logFd = openSync(logPath, "a");
  try {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ["ignore", logFd, logFd],
      ...options,
      windowsHide: true,
    });
    child.once("error", (error) => {
      appendFileSync(logPath, `\nFailed to start ${name}: ${error.message}\n`);
      process.exit(1);
    });
    child.once("exit", (code, signal) => {
      appendFileSync(logPath, `\n${name} exited (code ${code ?? "none"}, signal ${signal ?? "none"}).\n`);
      process.exit(1);
    });
    appendFileSync(logPath, `\nStarting ${name} (pid ${child.pid ?? "unknown"})\n`);
  } finally {
    closeSync(logFd);
  }
}

const nextLog = "next.log";
if (!(await isListening(3000))) {
  startService(
    "Next.js",
    process.execPath,
    [join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev"],
    nextLog,
  );
  if (!(await waitForPort(3000))) {
    throw new Error(`Next.js did not open port 3000; inspect ${join(logDir, nextLog)}.`);
  }
} else {
  appendFileSync(join(logDir, nextLog), "\nNext.js already listens on port 3000.\n");
}

if (!(await isListening(8288))) {
  const pnpm = join(localAppData, "pnpm", "pnpm.cmd");
  startService(
    "Inngest Dev Server",
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/c", `call ${pnpm} dev:inngest`],
    "inngest.log",
    { windowsVerbatimArguments: true },
  );
  if (!(await waitForPort(8288, 120_000))) {
    throw new Error(`Inngest did not open port 8288; inspect ${join(logDir, "inngest.log")}.`);
  }
} else {
  appendFileSync(join(logDir, "inngest.log"), "\nInngest already listens on port 8288.\n");
}

console.log(`Local dev services are running. Logs: ${logDir}`);
setInterval(() => {}, 60_000);
