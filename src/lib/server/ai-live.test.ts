import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiRunMetadata } from "./campaign-generator";

vi.mock("server-only", () => ({}));
import { scanWebsite } from "./scanner";
import { enrichScannedWebsite } from "./brand-intelligence";
import { generateCampaignV2 } from "./generation-v2";
import * as platformContent from "./generation-v2/content";
import * as critic from "./generation-v2/critic";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";

// Explicit opt-in: real provider requests, with no database writes or campaign usage.
describe.skipIf(process.env.RUN_LIVE_AI_TESTS !== "true")("live AI verification", () => {
  const runs: Array<AiRunMetadata & { error?: string }> = [];
  const requests: Array<Record<string, unknown>> = [];
  const results: Record<string, unknown> = {};
  const saveResults = () => writeFileSync("output/ai-live-verification.json", JSON.stringify({ runs, requests, results }, null, 2));
  beforeAll(() => {
    for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
    mkdirSync("output", { recursive: true });
    saveResults();
    const generate = platformContent.generatePlatformContent;
    const review = critic.reviewCampaignGeneration;
    vi.spyOn(platformContent, "generatePlatformContent").mockImplementation(async (...args) => {
      const outputs = await generate(...args);
      results.latestDrafts = outputs;
      saveResults();
      return outputs;
    });
    vi.spyOn(critic, "reviewCampaignGeneration").mockImplementation(async (...args) => {
      const assessment = await review(...args);
      results.latestReview = assessment;
      saveResults();
      return assessment;
    });
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      if (typeof init?.body === "string" && String(input).includes("/chat/completions")) {
        const request = JSON.parse(init.body);
        const payload = await response.clone().json();
        requests.push({ model: request.model, status: response.status,
          maxCompletionTokens: request.max_completion_tokens ?? request.max_tokens,
          usage: payload.usage, finishReason: payload.choices?.[0]?.finish_reason,
          error: payload.error?.message, errorCode: payload.error?.code });
        saveResults();
      }
      return response;
    });
    const record = (...messages: unknown[]) => {
      for (const message of messages) {
        if (typeof message === "string" && message.startsWith("[ai-run] ")) {
          runs.push(JSON.parse(message.slice("[ai-run] ".length)));
          saveResults();
        }
      }
    };
    vi.spyOn(console, "info").mockImplementation(record);
    vi.spyOn(console, "error").mockImplementation(record);
  });
  afterAll(() => {
    saveResults();
    vi.restoreAllMocks();
  });

  it("curates and interprets a real website using AI rather than the fallback", async () => {
    const started = Date.now();
    const scan = await enrichScannedWebsite(await scanWebsite("https://free-ai-lm.vercel.app/"));
    results.scan = { durationMs: Date.now() - started, pages: scan.pages.length,
      curationMode: scan.curation?.mode, claims: scan.profile.claims.length };
    expect(scan.curation?.mode).toBe("ai");
    expect(runs.some((run) => run.task === "brandTextModel" && run.success)).toBe(true);
  }, 45_000);

  it("generates and reviews source-backed X and LinkedIn posts using real AI", async () => {
    const firstRun = runs.length;
    const started = Date.now();
    const generation = await generateCampaignV2({
      brand: DEMO_BRAND, kind: "launch", goal: "Introduce the campaign workflow to solo founders",
      updateDetails: "Turn a website and product update into channel-specific launch copy, with real screenshots in the visuals.",
      audience: "Solo SaaS founders", launchDate: "", cta: "Build your launch campaign",
      angle: DEMO_ANGLES[0], channels: ["x", "linkedin"],
    });
    results.generation = { durationMs: Date.now() - started, mode: generation.mode,
      outputs: generation.outputs.map(({ channel, primaryCopy, linkedClaimIds }) => ({ channel, primaryCopy, linkedClaimIds })),
      review: generation.generationV2?.review };
    expect(generation.mode).toBe("ai");
    expect(generation.outputs.map((output) => output.channel)).toEqual(["x", "linkedin"]);
    expect(generation.outputs.every((output) => output.primaryCopy.length > 30)).toBe(true);
    expect(generation.generationV2?.review.unsupportedStatements).toEqual([]);
    expect(generation.generationV2?.review.needsRewrite).toBe(false);
    expect(runs.slice(firstRun).every((run) => run.success)).toBe(true);
  }, 180_000);
});
