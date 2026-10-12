import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), spawn: vi.fn() }));
vi.mock("node:net", () => ({ connect: mocks.connect }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({ mkdirSync: vi.fn(), openSync: () => 10 }));
// The launcher uses native Node APIs so this module is also exercised by cold startup.
// @ts-expect-error Node development helper is JavaScript.
import { ensureLocalWorker, monitorLocalWorker } from "./local-worker.mjs";

describe("local worker recovery", () => {
  let running = true;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("INNGEST_DEV", "1");
    vi.stubEnv("INNGEST_BASE_URL", "http://localhost:8288");
    vi.stubEnv("npm_execpath", "pnpm.exe");
    running = true;
    mocks.connect.mockReset().mockImplementation(() => {
      const socket = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() });
      queueMicrotask(() => socket.emit(running ? "connect" : "error", new Error("offline")));
      return socket;
    });
    mocks.spawn.mockReset().mockImplementation(() => {
      running = true;
      return Object.assign(new EventEmitter(), { kill: vi.fn() });
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

  it("does not start another worker when one is already listening", async () => {
    await ensureLocalWorker();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("recovers a worker that disappears after successful app startup", async () => {
    await ensureLocalWorker();
    const monitor = monitorLocalWorker();
    running = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.spawn.mock.calls[0][2]).toMatchObject({ windowsHide: true, stdio: ["inherit", 10, 10] });
    expect(mocks.spawn.mock.calls[0][2].detached).not.toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    clearInterval(monitor);
  });
  it("leaves production and remote workers alone", async () => {
    vi.stubEnv("INNGEST_DEV", "0");
    await ensureLocalWorker();
    vi.stubEnv("INNGEST_DEV", "1");
    vi.stubEnv("INNGEST_BASE_URL", "https://worker.example.com");
    await ensureLocalWorker();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
