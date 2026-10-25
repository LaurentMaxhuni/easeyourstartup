import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generationInputSchema } from "@/lib/design-studio/workflow";
import type { DatabaseClient } from "@/lib/server/database";

const state = vi.hoisted(() => ({
  status: "queued", tokens: 0, failCheckpoint: false, queries: [] as string[],
  input: {} as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/database", () => ({
  requireDatabase: () => (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?").replace(/\s+/g, " ").trim();
    state.queries.push(sql);
    if (sql.startsWith("select input")) return [{ input: state.input, status: state.status, attempt: 1 }];
    if (sql.startsWith("select status")) return [{ status: state.status, attempt: 1 }];
    if (sql.includes("sum(input_tokens")) return [{ tokens: state.tokens }];
    if (sql.startsWith("insert into public.design_ai_events")) {
      state.tokens += Number(values[5]) + Number(values[6]);
      return [];
    }
    if (sql.includes("set stage =") && state.failCheckpoint) {
      state.failCheckpoint = false;
      throw new Error("Temporary checkpoint connection failure");
    }
    if (sql.includes("set status = 'running'")) state.status = "running";
    if (sql.includes("set status = 'failed'")) state.status = "failed";
    if (sql.includes("set status = 'completed'")) state.status = "completed";
    return [{ id: "33333333-3333-4333-8333-333333333333" }];
  }) as unknown as DatabaseClient,
}));
vi.mock("./pipeline", async (importOriginal) => ({
  ...await importOriginal<typeof import("./pipeline")>(), runDesignPipeline: vi.fn(),
}));

import { inngest } from "@/inngest/client";
import { runDesignPipeline, type PipelineResult } from "./pipeline";
import { generateStudioDesign } from "./jobs";

// Use the installed SDK's actual async step lifecycle. A callback-only step mock
// misses suspended user handlers and cannot expose leaked cancellation timers.
type SdkExecution = { start(): Promise<{ type: string; step?: { error?: unknown } }> };
type ExecutableFunction = { createExecution(options: unknown): SdkExecution };
const result: PipelineResult = { variants: [], usage: [], warnings: [] };
const spyOnInterval = () => vi.spyOn(globalThis, "setInterval");
const spyOnClear = () => vi.spyOn(globalThis, "clearInterval");
let intervalSpy: ReturnType<typeof spyOnInterval>;
let clearSpy: ReturnType<typeof spyOnClear>;

async function execute(attempt = 0) {
  const event = { id: "design-review-event", name: "design-studio/generation.requested", ts: Date.now(), data: {
    jobId: "33333333-3333-4333-8333-333333333333",
    workspaceId: "11111111-1111-4111-8111-111111111111", attempt: 1,
  } };
  return (generateStudioDesign as unknown as ExecutableFunction).createExecution({ version: 1, partialOptions: {
    client: inngest, reqArgs: [], runId: "design-review-run", headers: {},
    data: { event, events: [event], runId: "design-review-run", attempt },
    stepState: {}, stepCompletionOrder: [],
  } }).start();
}

beforeEach(() => {
  vi.stubEnv("DESIGN_JOB_TOKEN_BUDGET", "10000");
  state.input = generationInputSchema.parse({ action: "generate", prompt: "Create a clear launch poster", brand: {}, tokenBudget: 60000 });
  state.status = "queued"; state.tokens = 0; state.failCheckpoint = false; state.queries = [];
  vi.mocked(runDesignPipeline).mockReset();
  intervalSpy = spyOnInterval();
  clearSpy = spyOnClear();
});
afterEach(() => {
  // Clean up even when running this regression test against the broken worker.
  for (const entry of intervalSpy.mock.results) if (entry.type === "return") clearInterval(entry.value);
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

describe("design worker durable recovery", () => {
  it("clears cancellation polling before the SDK returns a durable step response", async () => {
    vi.mocked(runDesignPipeline).mockImplementation(async (_input, services) => {
      await services.run!("review-stage", async () => result);
      return result;
    });
    expect((await execute()).type).toBe("step-ran");
    const polls = intervalSpy.mock.results.filter((entry, index) => entry.type === "return" && intervalSpy.mock.calls[index][1] === 2000);
    expect(polls.length).toBeGreaterThan(0);
    for (const poll of polls) expect(clearSpy.mock.calls.some(([timer]) => timer === poll.value)).toBe(true);
  });

  it("counts failed-stage usage against the server cap when the SDK retries that stage", async () => {
    let calls = 0;
    const remaining: number[] = [];
    vi.mocked(runDesignPipeline).mockImplementation(async (_input, services) => {
      await services.run!("billable-stage", async () => {
        remaining.push(await services.getRemainingTokens!());
        if (calls++ === 0) {
          await services.onUsage!({ provider: "synthetic", model: "synthetic", inputTokens: 5000, outputTokens: 4500, latencyMs: 1, fallbacks: 0 });
          throw new Error("Billable invalid output");
        }
        return result;
      });
      return result;
    });
    expect((await execute()).step?.error).toBeDefined();
    expect((await execute(1)).type).toBe("step-ran");
    expect(remaining).toEqual([10000, 500]);
    expect(state.tokens).toBe(9500);
  });

  it("retains admission during checkpoint recovery and reserves terminal failure for onFailure", async () => {
    state.failCheckpoint = true;
    vi.mocked(runDesignPipeline).mockImplementation(async (_input, services) => {
      await services.checkpoint("Interpreting brief");
      await services.run!("recovered-stage", async () => result);
      return result;
    });
    expect((await execute()).type).toBe("function-rejected");
    expect(state.status).toBe("running");
    expect(state.queries.some((sql) => sql.includes("set status = 'failed'"))).toBe(false);
    expect((await execute(1)).type).toBe("step-ran");
    expect(state.status).toBe("running");
  });
});
