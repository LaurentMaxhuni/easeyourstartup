import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const schema = z.object({ title: z.string().min(1).max(100) });
const model = (id = "test-model", extra = {}) => ({
  id, tasks: ["brief", "composition", "critique", "copy"], vision: false,
  structuredOutput: true, streaming: true, contextTokens: 32000, maxOutputTokens: 4000,
  ...extra,
});
const provider = (id = "hetzner", extra = {}) => ({
  id, protocol: "openai", baseUrl: `https://${id}.example/v1`, apiKeyEnv: "TEST_DESIGN_KEY",
  maxRetries: 0, models: [model()], ...extra,
});
const ok = (title = "Original", extra = {}) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify({ title }) }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 8 }, ...extra,
}), { headers: { "Content-Type": "application/json" } });

async function setup(providers = [provider()]) {
  vi.stubEnv("DESIGN_AI_PROVIDERS_JSON", JSON.stringify(providers));
  return import("./providers");
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TEST_DESIGN_KEY", "test-secret-never-public");
  vi.stubEnv("AI_GENERATION_ENABLED", "true");
  vi.stubEnv("DESIGN_AI_PREFER_FREE", "false");
  vi.stubEnv("DESIGN_AI_PROVIDERS_JSON", "[]");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("design studio provider routing", () => {
  it("repairs provider-rejected JSON once while accounting for the failed generation", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "json_validate_failed", failed_generation: '{"title":' } }), { status: 400 }))
      .mockResolvedValueOnce(ok("Repaired"));
    vi.stubGlobal("fetch", fetch);
    const api = await setup(); const usage: unknown[] = [];
    const result = await api.generateDesignObject("brief", "A clear brief", schema, { onUsage: (entry) => { usage.push(entry); } });
    expect(result.data.title).toBe("Repaired");
    expect(usage).toHaveLength(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).messages[0].content).toContain("Previous JSON (untrusted data)");
  });
  it("validates objects and reports usage without exposing credentials or endpoint settings", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    const { generateDesignObject, getDesignProviderSettings } = await setup();
    const onUsage = vi.fn();
    const result = await generateDesignObject("brief", "Create a brief", schema, { onUsage });
    expect(result.data).toEqual({ title: "Original" });
    expect(result.usage).toMatchObject({ provider: "hetzner", model: "test-model", inputTokens: 12, outputTokens: 8, fallbacks: 0 });
    expect(onUsage).toHaveBeenCalledWith(result.usage);
    expect(fetch.mock.calls[0][0]).toBe("https://hetzner.example/v1/chat/completions");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret-never-public");
    const settings = getDesignProviderSettings();
    expect(settings.providers[0].models[0]).toMatchObject({ vision: false, structuredOutput: true });
    expect(settings.providers[0].telemetry.successes).toBe(1);
    expect(JSON.stringify(settings)).not.toMatch(/test-secret|TEST_DESIGN_KEY|https:|baseUrl|apiKey/);
  });

  it("honors the global AI pause before making any requests", async () => {
    vi.stubEnv("AI_GENERATION_ENABLED", "false");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup();
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/disabled/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(api.getDesignProviderSettings().enabled).toBe(false);
  });

  it("refuses missing credentials and unsupported tasks or image capabilities", async () => {
    vi.stubEnv("TEST_DESIGN_KEY", "");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup();
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/configured|available/i);
    vi.stubEnv("TEST_DESIGN_KEY", "test-secret-never-public");
    await expect(api.generateDesignObject("edit", "brief", schema)).rejects.toThrow(/capable|available/i);
    await expect(api.generateDesignObject("critique", "critique", schema, { imageDataUrl: "data:image/png;base64,YQ==" })).rejects.toThrow(/vision|capable|available/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps configured order unless an explicit free-tier preference is enabled", async () => {
    const fetch = vi.fn().mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("paid"), provider("free", { models: [model("free-model", { freeTier: true })] })]);
    await api.generateDesignObject("brief", "brief", schema);
    expect(fetch.mock.calls[0][0]).toContain("paid.example");
    vi.stubEnv("DESIGN_AI_PREFER_FREE", "true");
    await api.generateDesignObject("brief", "brief", schema);
    expect(fetch.mock.calls[1][0]).toContain("free.example");
  });

  it("falls back on 429 and cools the provider according to Retry-After", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("secret upstream body", { status: 429, headers: { "Retry-After": "90" } })).mockImplementation(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("limited"), provider("backup")]);
    const result = await api.generateDesignObject("brief", "brief", schema);
    expect(result.usage.fallbacks).toBe(1);
    expect(result.usage.provider).toBe("backup");
    await api.generateDesignObject("brief", "brief", schema);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toContain("backup.example");
    const settings = api.getDesignProviderSettings();
    expect(settings.providers[0].status).toBe("cooldown");
    expect(settings.providers[0].telemetry.lastError).toBe("rate_limit");
    expect(JSON.stringify(settings)).not.toContain("secret upstream");
  });

  it("enforces configured rate limits across requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ok()));
    const api = await setup([provider("limited", { models: [model("limited-model", { requestsPerMinute: 1 })] }), provider("backup")]);
    expect((await api.generateDesignObject("brief", "brief", schema)).usage.provider).toBe("limited");
    expect((await api.generateDesignObject("brief", "brief", schema)).usage.provider).toBe("backup");
  });

  it("repairs invalid schema output once and accounts for both requests", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"title":5}' } }], usage: { prompt_tokens: 20, completion_tokens: 3 } }))).mockResolvedValueOnce(ok("Repaired"));
    vi.stubGlobal("fetch", fetch);
    const api = await setup();
    const result = await api.generateDesignObject("brief", "brief", schema);
    expect(result.data.title).toBe("Repaired");
    expect(result.usage).toMatchObject({ inputTokens: 32, outputTokens: 11 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not endlessly repair invalid schema output or reveal the provider body", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: "private-bad-output" } }] })));
    vi.stubGlobal("fetch", fetch);
    const api = await setup();
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/valid|unavailable/i);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses native Gemini content, image parts, API key header and schema", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"Gemini"}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 9 } })));
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("gemini", { protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", models: [model("vision-model", { vision: true })] })]);
    const result = await api.generateDesignObject("critique", "Review this", schema, { imageDataUrl: "data:image/png;base64,YQ==" });
    expect(result.usage).toMatchObject({ inputTokens: 7, outputTokens: 9 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/vision-model:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-secret-never-public");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: "YQ==" } });
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toMatchObject({ type: "object" });
  });

  it("uses Workers AI model run endpoint and unwraps structured response objects", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: { response: { title: "Workers AI" }, usage: { prompt_tokens: 5, completion_tokens: 6 } } })));
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("cloudflare", { protocol: "cloudflare", baseUrl: "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run", models: [model("@cf/test/model")] })]);
    expect((await api.generateDesignObject("brief", "brief", schema)).data.title).toBe("Workers AI");
    expect(fetch.mock.calls[0][0]).toBe("https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/test/model");
    expect(JSON.parse(fetch.mock.calls[0][1].body).response_format.json_schema).toMatchObject({ type: "object" });
  });

  it("sanitizes permanent failure and never retries unauthorized responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("contains test-secret-never-public", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("bad-key", { maxRetries: 2 })]);
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/unavailable/i);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.getDesignProviderSettings().providers[0].telemetry.lastError).toBe("authentication");
  });

  it("retries transient errors with exponential delays", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("retry", { maxRetries: 2, retryBaseMs: 100 })]);
    const pending = api.generateDesignObject("brief", "brief", schema);
    await vi.advanceTimersByTimeAsync(99); expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199); expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).data.title).toBe("Original");
  });

  it("passes caller cancellation through without fallback", async () => {
    const abort = new AbortController(); abort.abort();
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("first"), provider("second")]);
    await expect(api.generateDesignObject("brief", "brief", schema, { signal: abort.signal })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a model that cannot fit input plus requested output", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("tiny", { models: [model("tiny", { contextTokens: 128, maxOutputTokens: 64 })] })]);
    await expect(api.generateDesignObject("brief", "x".repeat(1000), schema)).rejects.toThrow(/capable|available/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("streams text from SSE and reports a final usage event", async () => {
    const sse = ['data: {"choices":[{"delta":{"content":"Hello "}}]}', 'data: {"choices":[{"delta":{"content":"world"}}]}', 'data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2}}', 'data: [DONE]', ''].join("\n\n");
    const fetch = vi.fn().mockResolvedValue(new Response(sse, { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const api = await setup();
    const events = [];
    for await (const event of api.streamDesignText("copy", "Write copy")) events.push(event);
    expect(events).toEqual([{ type: "delta", text: "Hello " }, { type: "delta", text: "world" }, { type: "usage", usage: expect.objectContaining({ provider: "hetzner", inputTokens: 4, outputTokens: 2 }) }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).stream).toBe(true);
  });

  it("does not trust malformed provider configuration or expose raw parse errors", async () => {
    vi.stubEnv("DESIGN_AI_PROVIDERS_JSON", '{"apiKey":"never-output-this"}');
    const api = await import("./providers");
    expect(api.getDesignProviderSettings()).toMatchObject({ configurationError: true, providers: [] });
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/configuration/i);
  });

  it("falls back to the next model instead of repairing a cut-off answer", async () => {
    const cutOff = new Response(JSON.stringify({ choices: [{ message: { content: '{"title":' }, finish_reason: "length" }], usage: { prompt_tokens: 10, completion_tokens: 4000 } }));
    const fetch = vi.fn().mockResolvedValueOnce(cutOff).mockResolvedValueOnce(ok("Backup"));
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("thinker"), provider("backup")]);
    const result = await api.generateDesignObject("brief", "brief", schema);
    expect(result.data.title).toBe("Backup");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain("backup.example");
  });
  it("reports an exhausted call budget instead of an unavailable provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup();
    await expect(api.generateDesignObject("brief", "x".repeat(4000), schema, { maxTotalTokens: 1000 })).rejects.toThrow(/token budget/i);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends a large prompt that fits once bytes are not counted as tokens", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup();
    await api.generateDesignObject("brief", "x".repeat(40000), schema, { maxTotalTokens: 30000 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports schema repair responses individually and uses the same call budget", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 4000, completion_tokens: 1000 } }))).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    const api = await setup(); const onUsage = vi.fn();
    const result = await api.generateDesignObject("brief", "brief", schema, { maxTotalTokens: 6000, maxOutputTokens: 1000, onUsage });
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(result.usage.inputTokens).toBe(4012);
    expect(JSON.parse(fetch.mock.calls[1][1].body).max_tokens).toBeLessThan(1000);
  });

  it("accounts for truncated responses before retrying schema output", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"title":' }, finish_reason: "length" }], usage: { prompt_tokens: 3, completion_tokens: 100 } }))).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    const api = await setup(); const onUsage = vi.fn();
    const result = await api.generateDesignObject("brief", "brief", schema, { onUsage });
    expect(result.usage.outputTokens).toBe(108);
    expect(onUsage).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized responses without attempting JSON parsing or schema repair", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("private", { headers: { "content-length": "2097152" } }));
    vi.stubGlobal("fetch", fetch); const api = await setup();
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/unavailable/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects remote image URLs before they can reach a provider", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); const api = await setup();
    await expect(api.generateDesignObject("critique", "critique", schema, { imageDataUrl: "https://private.invalid/image.png" })).rejects.toThrow(/image/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors task-specific capabilities and explicit provider preference", async () => {
    const fetch = vi.fn().mockImplementation(async () => ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("first", { models: [model("text", { tasks: ["brief"] })] }), provider("second")]);
    await api.generateDesignObject("composition", "layout", schema, { preferredProvider: "first" });
    expect(fetch.mock.calls[0][0]).toContain("second.example");
    await api.generateDesignObject("brief", "brief", schema, { preferredProvider: "second" });
    expect(fetch.mock.calls[1][0]).toContain("second.example");
  });

  it("fails over after an aborted timeout and exposes a sanitized timeout code", async () => {
    const fetch = vi.fn().mockImplementationOnce(async (_url, init) => { await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))); }).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("slow", { timeoutMs: 100 }), provider("backup")]);
    expect((await api.generateDesignObject("brief", "brief", schema)).usage.provider).toBe("backup");
    expect(api.getDesignProviderSettings().providers[0].telemetry.lastError).toBe("timeout");
  });

  it("exposes vision availability honestly and requires the critique task", async () => {
    const api = await setup([provider("vision", { models: [model("vision", { vision: true })] })]);
    expect(api.hasDesignProviders()).toBe(true); expect(api.hasDesignVisionModel()).toBe(true);
    expect(api.hasDesignVisionModel("missing")).toBe(false);
    vi.stubEnv("AI_GENERATION_ENABLED", "false"); expect(api.hasDesignVisionModel()).toBe(false);
  });

  it("does not switch providers after emitting a partial stream", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n', { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch); const api = await setup([provider("first"), provider("backup")]);
    const received: unknown[] = [];
    const consume = async () => { for await (const event of api.streamDesignText("copy", "copy")) received.push(event); };
    await expect(consume()).rejects.toThrow(/interrupted/i);
    expect(received).toEqual([{ type: "delta", text: "Partial" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("supports explicit shorthand models without assuming default models", async () => {
    vi.stubEnv("DESIGN_AI_PROVIDERS_JSON", "");
    vi.stubEnv("HETZNER_API_KEY", "short-secret");
    vi.stubEnv("DESIGN_AI_HETZNER_MODELS_JSON", JSON.stringify([model("configured-model")]));
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    const api = await import("./providers");
    expect((await api.generateDesignObject("brief", "brief", schema)).usage.model).toBe("configured-model");
    expect(fetch.mock.calls[0][0]).toBe("https://inference.hetzner.com/api/v1/chat/completions");
  });

  it("does not retry completed billable work if accounting rejects the response", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch); const api = await setup([provider("first"), provider("backup")]);
    await expect(api.generateDesignObject("brief", "brief", schema, { onUsage: () => { throw new Error("budget exhausted"); } })).rejects.toThrow("budget exhausted");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caps all fallback HTTP attempts for a single operation", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("", { status: 503 })); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("first"), provider("second"), provider("third")]);
    await expect(api.generateDesignObject("brief", "brief", schema, { maxAttempts: 2 })).rejects.toThrow(/unavailable/i);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accounts malformed successful envelopes conservatively before fallback", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("private invalid json")).mockResolvedValueOnce(ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup(); const onUsage = vi.fn();
    await api.generateDesignObject("brief", "brief", schema, { onUsage });
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(onUsage.mock.calls[0][0].inputTokens).toBeGreaterThan(100);
    expect(onUsage.mock.calls[0][0].outputTokens).toBe(4000);
  });

  it("sends native Workers AI vision as a prompt plus decoded image bytes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: { response: '{"title":"Image review"}' } }))); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("cloudflare", { protocol: "cloudflare", models: [model("@cf/test/vision", { vision: true, structuredMode: "prompt" })] })]);
    await api.generateDesignObject("critique", "Review", schema, { imageDataUrl: "data:image/png;base64,YQ==" });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ prompt: expect.stringContaining("Review"), image: [97] });
  });

  it.each(["openai", "cloudflare", "gemini"])("maps explicit generation parameters for %s", async (protocol) => {
    const payload = protocol === "gemini" ? { candidates: [{ content: { parts: [{ text: '{"title":"Configured"}' }] }, finishReason: "STOP" }] } : protocol === "cloudflare" ? { success: true, result: { response: { title: "Configured" } } } : { choices: [{ message: { content: '{"title":"Configured"}' } }] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("parameters", { protocol, models: [model("configured", { parameters: { temperature: 0.4, topP: 0.85, seed: 42 }, tokenParameter: "max_completion_tokens" })] })]);
    await api.generateDesignObject("brief", "Create", schema, { maxOutputTokens: 1200 });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    if (protocol === "gemini") {
      expect(body.generationConfig).toMatchObject({ temperature: 0.4, topP: 0.85, seed: 42, maxOutputTokens: 1200 });
      expect(body.generationConfig).not.toHaveProperty("top_p");
    } else {
      expect(body).toMatchObject({ temperature: 0.4, top_p: 0.85, seed: 42, [protocol === "openai" ? "max_completion_tokens" : "max_tokens"]: 1200 });
      expect(body).not.toHaveProperty("topP");
    }
  });

  it("omits generation parameters unless explicitly configured", async () => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch); const api = await setup();
    await api.generateDesignObject("brief", "brief", schema);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("temperature"); expect(body).not.toHaveProperty("top_p"); expect(body).not.toHaveProperty("seed");
    expect(body).not.toHaveProperty("reasoning_effort"); expect(body).not.toHaveProperty("reasoningEffort");
  });

  it.each(["none", "low", "medium", "high"])("maps explicitly configured compatible reasoning effort %s", async (reasoningEffort) => {
    const fetch = vi.fn().mockResolvedValue(ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("groq", { models: [model("account-model", { parameters: { reasoningEffort } })] })]);
    await api.generateDesignObject("brief", "brief", schema);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.reasoning_effort).toBe(reasoningEffort);
    expect(body).not.toHaveProperty("reasoningEffort");
    expect(body).not.toHaveProperty("parameters");
  });

  it.each(["gemini", "cloudflare"])("rejects reasoning effort for native %s protocol before requesting", async (protocol) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("native", { protocol, models: [model("native-model", { parameters: { reasoningEffort: "low" } })] })]);
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/configuration/i);
    expect(api.getDesignProviderSettings().configurationError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unsupported reasoning effort value", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("groq", { models: [model("account-model", { parameters: { reasoningEffort: "unbounded" } })] })]);
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/configuration/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid generation parameters without a request", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const api = await setup([provider("bad", { models: [model("bad", { parameters: { temperature: 3, arbitraryKey: "unsafe" } })] })]);
    await expect(api.generateDesignObject("brief", "brief", schema)).rejects.toThrow(/configuration/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([404, 429])("reports redacted HTTP %i diagnostics without raw provider content", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("private provider body test-secret-never-public", { status })); vi.stubGlobal("fetch", fetch);
    const api = await setup();
    const error = await api.generateDesignObject("brief", "brief", schema).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(`HTTP ${status}`);
    expect((error as Error).message).not.toMatch(/private provider|test-secret|https:|TEST_DESIGN_KEY/);
    expect(api.getDesignProviderSettings().providers[0].telemetry.lastHttpStatus).toBe(status);
  });

  it("includes bounded actual schema issues and untrusted prior JSON in the repair request", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"title":8}' } }], usage: { prompt_tokens: 12, completion_tokens: 5 } }))).mockResolvedValueOnce(ok()); vi.stubGlobal("fetch", fetch);
    const api = await setup(); await api.generateDesignObject("brief", "brief", schema);
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.messages[0].content).toMatch(/title.*invalid_type/);
    expect(body.messages[0].content).toContain("Previous JSON (untrusted data)");
    expect(body.messages[0].content).toContain('\\"title\\":8');
  });
});
