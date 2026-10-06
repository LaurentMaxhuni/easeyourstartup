import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({ useEffect: (callback: () => (() => void) | undefined) => { mocks.cleanup = callback(); } }));
import { RenderReadinessSignal } from "./render-readiness-signal";

afterEach(() => { mocks.cleanup?.(); vi.unstubAllGlobals(); });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function render(decode: () => Promise<void>) {
  const root = { dataset: {} as Record<string, string> };
  vi.stubGlobal("document", { documentElement: root, getAnimations: () => [], fonts: { ready: Promise.resolve() }, images: [{ decode }] });
  RenderReadinessSignal();
  return root.dataset;
}

it("waits for successful image decoding", async () => {
  let resolve!: () => void;
  const dataset = render(() => new Promise<void>((complete) => { resolve = complete; }));
  await flush();
  expect(dataset.renderReady).not.toBe("true");
  resolve();
  await flush();
  expect(dataset.renderReady).toBe("true");
});

it("reports a failed image without marking the export ready", async () => {
  const dataset = render(() => Promise.reject(new Error("broken image")));
  await flush();
  expect(dataset.renderReady).not.toBe("true");
  expect(dataset.renderError).toBe("true");
});

it("does not signal readiness after unmounting", async () => {
  let resolve!: () => void;
  const dataset = render(() => new Promise<void>((complete) => { resolve = complete; }));
  await flush();
  mocks.cleanup?.();
  resolve();
  await flush();
  expect(dataset.renderReady).not.toBe("true");
});
