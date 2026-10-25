import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import {
  autoCurateClaims,
  generateDeterministicCampaign,
  getOpenAIProviderConfig,
  getOpenAIProviderSetup,
  getStructuredAiTimeoutMs,
  isAiGenerationEnabled,
  parseAiCampaignResult,
  normalizeGenerationPayload,
  parseStructuredJson,
  publicProviderError,
} from "@/lib/server/campaign-generator";
import * as campaignGenerator from "@/lib/server/campaign-generator";
import { claimCurationResultSchema, creativeDesignPlanSchema } from "@/lib/contracts";
import { unsupportedStatementSchema } from "./generation-v2/critic";
import {
  DEMO_ANGLES,
  DEMO_BRAND,
  DEMO_COMPOSITION,
  DEMO_SCAN,
} from "@/lib/demo-data";

function validCreativeDesignPlan() {
  const { tokens } = DEMO_COMPOSITION;
  const layerState = { rotation: 0, opacity: 1, locked: false, hidden: false };

  return {
    theme: {
      background: tokens.background,
      foreground: tokens.foreground,
      accent: tokens.accent,
      headingFontFamily: "Outfit",
      bodyFontFamily: "Outfit",
    },
    elements: [
      {
        ...layerState,
        id: "hero-image",
        kind: "image",
        asset: "primary",
        x: 54,
        y: 12,
        width: 38,
        height: 64,
      },
      {
        ...layerState,
        id: "launch-headline",
        kind: "text",
        textRole: "headline",
        text: "A launch visual made for your next big release",
        x: 8,
        y: 16,
        width: 42,
        height: 20,
        color: tokens.foreground,
        fontSize: 5,
        fontWeight: 700,
        align: "left",
      },
      {
        ...layerState,
        id: "launch-cta",
        kind: "text",
        textRole: "cta",
        text: DEMO_COMPOSITION.text.cta,
        x: 8,
        y: 82,
        width: 32,
        height: 7,
        color: tokens.accent,
        fontSize: 2,
        fontWeight: 600,
        align: "left",
      },
      {
        ...layerState,
        id: "rocket-icon",
        kind: "icon",
        icon: "rocket-launch",
        x: 78,
        y: 10,
        width: 10,
        height: 10,
        color: tokens.accent,
      },
    ],
  };
}

describe("source-backed campaign generation", () => {
  it("redacts provider API keys from public failure details", () => {
    expect(publicProviderError(new Error("Provider rejected sk-test-secret"))).toBe(
      "Provider rejected [redacted]",
    );
  });

  it("preserves sanitized causes from wrapped provider failures", () => {
    const error = new Error("Review unavailable", {
      cause: new Error("NIM rejected nvapi-test-secret"),
    });
    expect(publicProviderError(error)).toBe(
      "Review unavailable Cause: NIM rejected [redacted]",
    );
  });

  it("honors the operator AI-generation kill switch", async () => {
    vi.stubEnv("AI_GENERATION_ENABLED", "false");
    try {
      expect(isAiGenerationEnabled()).toBe(false);
      await expect(campaignGenerator.generateCampaign({
        brand: DEMO_BRAND,
        kind: "launch",
        goal: "Launch the campaign workflow to solo founders",
        updateDetails: "The campaign workflow is now available.",
        audience: "Solo SaaS founders",
        launchDate: "",
        cta: "Try it",
        angle: DEMO_ANGLES[0],
        channels: ["x"],
      })).rejects.toThrow(/temporarily disabled/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("curates duplicate and low-signal scan snippets without user decisions", () => {
    const scan = {
      ...DEMO_SCAN,
      profile: {
        ...DEMO_SCAN.profile,
        claims: [
          DEMO_SCAN.profile.claims[0],
          { ...DEMO_SCAN.profile.claims[0], id: "duplicate" },
          {
            ...DEMO_SCAN.profile.claims[1],
            id: "cookie",
            text: "Read our cookie policy before continuing.",
          },
        ],
      },
    };

    const curated = autoCurateClaims(scan);

    expect(curated.profile.claims.map((claim) => claim.id)).toEqual([
      DEMO_SCAN.profile.claims[0].id,
    ]);
    expect(curated.curation).toMatchObject({
      mode: "rules",
      candidateCount: 3,
      keptCount: 1,
    });
  });

  it("links only approved claims", () => {
    const brand = {
      ...DEMO_BRAND,
      claims: DEMO_BRAND.claims.map((claim, index) => ({
        ...claim,
        approvalState: index === 0 ? ("approved" as const) : ("rejected" as const),
      })),
    };
    const result = generateDeterministicCampaign({
      brand,
      kind: "feature_update",
      goal: "Invite founders to test the campaign builder",
      updateDetails:
        "The source-backed campaign builder is available in the launch studio.",
      audience: "Solo SaaS founders",
      launchDate: "2026-07-25",
      cta: "Try the free scan",
      angle: DEMO_ANGLES[0],
      channels: ["x", "linkedin", "email"],
    });

    expect(result.outputs).toHaveLength(3);
    for (const output of result.outputs) {
      expect(output.linkedClaimIds).toEqual([DEMO_BRAND.claims[0].id]);
      expect(output.linkedClaimIds).not.toContain(DEMO_BRAND.claims[1].id);
    }
  });

  it("warns when generation uses no curated website facts", () => {
    const result = generateDeterministicCampaign({
      brand: {
        ...DEMO_BRAND,
        claims: DEMO_BRAND.claims.map((claim) => ({
          ...claim,
          approvalState: "rejected" as const,
        })),
      },
      kind: "launch",
      goal: "Collect useful launch feedback from founders",
      updateDetails: "A new founder tool is ready for an early test.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Join the beta",
      angle: DEMO_ANGLES[1],
      channels: ["reddit"],
    });

    expect(result.outputs[0].linkedClaimIds).toEqual([]);
    expect(result.outputs[0].warnings[0]).toMatch(/No curated/);
  });

  it("adapts structure for each channel", () => {
    const result = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x", "product_hunt", "email"],
    });
    const copy = result.outputs.map((output) => output.primaryCopy);
    expect(new Set(copy).size).toBe(3);
    expect(copy[1]).toContain("Hey Product Hunt");
    expect(copy[2]).toContain("Subject:");
  });

  it("returns multiple structured creative directions with richer post copy", () => {
    const result = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x"],
    });

    expect(result.creativeDirections).toHaveLength(3);
    expect(new Set(result.creativeDirections.map((direction) => direction.layout)).size).toBe(3);
    expect(result.creativeDirections[0].icon).toBeTruthy();
    expect(result.creativeDirections[0].body.length).toBeGreaterThan(20);
    expect(result.creativeDirections[0].subheadline.length).toBeGreaterThan(20);
    expect(result.creativeDirections[1].imageMode).toBe("devices");
  });
});

describe("OpenAI-compatible provider configuration", () => {
  it("keeps image-capable canvas design separate from text campaign planning", () => {
    const environment = { AI_PROVIDER: "groq", GROQ_API_KEY: "gsk_test", GROQ_MODEL: "openai/gpt-oss-20b",
      GROQ_DESIGN_PLANNER_MODEL: "openai/gpt-oss-120b" };
    expect(getOpenAIProviderConfig(environment, "brandVisionModel")?.model).toBe("qwen/qwen3.8-27b");
    expect(getOpenAIProviderConfig(environment, "designPlannerModel")?.model).toBe("openai/gpt-oss-120b");
  });

  it.each([
    ["malformed JSON", '{"items":[1 2]}'],
    ["empty content", null],
  ] as const)(
    "retries once with a JSON correction when chat output is %s",
    async (_failure, firstContent) => {
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          choices: [{ message: { content: firstContent } }],
        })
        .mockResolvedValueOnce({
          choices: [{ message: { content: '{"ok":true}' } }],
        });
      const requestChatJson = (
        campaignGenerator as unknown as {
          requestChatJson: (
            setup: {
              client: unknown;
              model: string;
              providerName: "openrouter";
            },
            messages: Array<{ role: "system" | "user"; content: string }>,
            maxCompletionTokens: number,
          ) => Promise<unknown>;
        }
      ).requestChatJson;

      const result = await requestChatJson(
        {
          client: { chat: { completions: { create } } },
          model: "openrouter/free",
          providerName: "openrouter",
        },
        [{ role: "system", content: "Return JSON." }],
        200,
      );

      expect(result).toEqual({ ok: true });
      expect(create.mock.calls[0][0]).toMatchObject({
        plugins: [{ id: "response-healing" }],
      });
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[1][0]).not.toHaveProperty("reasoning");
      expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({
        role: "user",
        content: expect.stringMatching(/valid JSON/i),
      });
    },
  );

  it("retries once when a chat provider returns no choices", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"ok":true}' } }],
      });
    const requestChatJson = (
      campaignGenerator as unknown as {
        requestChatJson: (
          setup: {
            client: unknown;
            model: string;
            providerName: "openrouter";
          },
          messages: Array<{ role: "system" | "user"; content: string }>,
          maxCompletionTokens: number,
        ) => Promise<unknown>;
      }
    ).requestChatJson;

    const result = await requestChatJson(
      {
        client: { chat: { completions: { create } } },
        model: "openrouter/free",
        providerName: "openrouter",
      },
      [{ role: "system", content: "Return JSON." }],
      200,
    );

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("parses JSON returned by chat providers even when fenced", () => {
    expect(parseStructuredJson("```json\n{\"text\":\"Clear launch copy\"}\n```"))
      .toEqual({ text: "Clear launch copy" });
  });

  it("uses strict JSON schema routing for OpenRouter structured requests", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"keptClaimIds":["claim-1"]}' } }],
    });
    const requestChatJson = (
      campaignGenerator as unknown as {
        requestChatJson: (
          setup: {
            client: unknown;
            model: string;
            providerName: "openrouter";
          },
          messages: Array<{ role: "system" | "user"; content: string }>,
          maxCompletionTokens: number,
          transform?: (value: unknown) => unknown,
          options?: { responseSchema?: unknown; schemaName?: string },
        ) => Promise<unknown>;
      }
    ).requestChatJson;

    const result = await requestChatJson(
      {
        client: { chat: { completions: { create } } },
        model: "openrouter/free",
        providerName: "openrouter",
      },
      [{ role: "system", content: "Return the kept claim ids." }],
      200,
      (value) => claimCurationResultSchema.parse(value),
      {
        responseSchema: claimCurationResultSchema,
        schemaName: "claim_curation",
      },
    );

    expect(result).toEqual({ keptClaimIds: ["claim-1"] });
    expect(create.mock.calls[0][0]).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: { name: "claim_curation", strict: true },
      },
      provider: { require_parameters: true, allow_fallbacks: true },
    });
  });

  it("auto-routes a Groq key to Groq with a supported default model", () => {
    expect(
      getOpenAIProviderConfig({ OPENAI_API_KEY: "gsk_example" }),
    ).toEqual({
      apiKey: "gsk_example",
      baseURL: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
    });
  });

  it("honors an explicit compatible provider URL and model", () => {
    expect(
      getOpenAIProviderConfig({
        OPENAI_API_KEY: "provider-key",
        OPENAI_BASE_URL: "https://example.test/v1",
        OPENAI_MODEL: "example-model",
      }),
    ).toEqual({
      apiKey: "provider-key",
      baseURL: "https://example.test/v1",
      model: "example-model",
    });
  });

  it("accepts Groq-specific environment names", () => {
    expect(
      getOpenAIProviderConfig({
        GROQ_API_KEY: "gsk_specific",
        GROQ_BASE_URL: "https://api.groq.com/openai/v1",
        GROQ_MODEL: "qwen/qwen3.6-27b",
      }),
    ).toEqual({
      apiKey: "gsk_specific",
      baseURL: "https://api.groq.com/openai/v1",
      model: "qwen/qwen3.6-27b",
    });
  });

  it("accepts OpenRouter free-model environment names", () => {
    expect(
      getOpenAIProviderConfig({
        OPENROUTER_API_KEY: "sk-or-v1-example",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        OPENROUTER_MODEL: "openrouter/free",
      }),
    ).toEqual({
      apiKey: "sk-or-v1-example",
      baseURL: "https://openrouter.ai/api/v1",
      model: "openrouter/free",
    });
  });

  it("honors an explicit provider without letting a different configured key override it", () => {
    expect(getOpenAIProviderConfig({
      AI_PROVIDER: "openrouter", NVIDIA_NIM_API_KEY: "nim-key", NVIDIA_NIM_MODEL: "nim-model",
      OPENROUTER_API_KEY: "router-key", OPENROUTER_MODEL: "openrouter/free",
    })).toEqual({ apiKey: "router-key", baseURL: "https://openrouter.ai/api/v1", model: "openrouter/free" });
    expect(getStructuredAiTimeoutMs("strategyModel", {
      AI_PROVIDER: "openrouter", NVIDIA_NIM_API_KEY: "nim-key", OPENROUTER_API_KEY: "router-key",
    })).toBe(45_000);
  });

  it("does not send an explicitly selected provider's key to another provider's endpoint", () => {
    expect(getOpenAIProviderConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "openai-key", OPENAI_MODEL: "openai-model",
      NVIDIA_NIM_BASE_URL: "https://integrate.api.nvidia.com/v1", NVIDIA_NIM_MODEL: "nim-model",
      OPENROUTER_MODEL: "router-model" })).toEqual({ apiKey: "openai-key", baseURL: undefined, model: "openai-model" });
    expect(getOpenAIProviderConfig({ AI_PROVIDER: "groq", NVIDIA_NIM_API_KEY: "nim-key" })).toBeNull();
    expect(getOpenAIProviderConfig({ AI_PROVIDER: "unknown", NVIDIA_NIM_API_KEY: "nim-key" })).toBeNull();
  });

  it("lets an OpenRouter key override stale Groq settings", () => {
    expect(
      getOpenAIProviderConfig({
        OPENROUTER_API_KEY: "sk-or-v1-example",
        OPENAI_BASE_URL: "https://api.groq.com/openai/v1",
        OPENAI_MODEL: "qwen/qwen3.6-27b",
      }),
    ).toMatchObject({
      baseURL: "https://openrouter.ai/api/v1",
      model: "openrouter/free",
    });
  });

  it("selects task-specific provider models", () => {
    const environment = {
      OPENROUTER_API_KEY: "sk-or-v1-example",
      OPENROUTER_MODEL: "openrouter/free",
      OPENROUTER_STRATEGY_MODEL: "openrouter/strategy-model",
      OPENROUTER_COPY_MODEL: "openrouter/copy-model",
    };

    expect(
      getOpenAIProviderConfig(environment, "strategyModel")?.model,
    ).toBe("openrouter/strategy-model");
    expect(getOpenAIProviderConfig(environment, "copyModel")?.model).toBe(
      "openrouter/copy-model",
    );
    expect(getOpenAIProviderConfig(environment, "criticModel")?.model).toBe(
      "openrouter/free",
    );
  });

  it("caps NVIDIA NIM structured requests at a two-minute response window", () => {
    expect(
      getStructuredAiTimeoutMs("strategyModel", {
        NVIDIA_NIM_API_KEY: "nim-test-key",
        NVIDIA_NIM_MODEL: "deepseek-ai/deepseek-v4.1-flash",
      }),
    ).toBe(120_000);
    expect(
      getStructuredAiTimeoutMs("designPlannerModel", {
        NVIDIA_NIM_API_KEY: "nim-test-key",
        NVIDIA_NIM_MODEL: "deepseek-ai/deepseek-v4.1-flash",
      }),
    ).toBe(120_000);
    expect(
      getStructuredAiTimeoutMs("strategyModel", {
        OPENROUTER_API_KEY: "router-test-key",
        OPENROUTER_MODEL: "openrouter/free",
      }),
    ).toBe(45_000);
  });

  it("bounds scan interpretation instead of waiting for a campaign-generation timeout", () => {
    expect(getStructuredAiTimeoutMs("brandTextModel", { NVIDIA_NIM_API_KEY: "test" })).toBe(8_000);
    expect(getStructuredAiTimeoutMs("brandTextModel", { OPENAI_API_KEY: "test" })).toBe(8_000);
  });

  it("falls back to source rules after one failed scan curation request", async () => {
    vi.stubEnv("AI_GENERATION_ENABLED", "true");
    vi.stubEnv("NVIDIA_NIM_API_KEY", "nim-test-key");
    vi.stubEnv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "unavailable" } }), {
      status: 503, headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await campaignGenerator.curateScannedClaims({ ...DEMO_SCAN, mode: "live" });
      expect(result.warnings.join(" ")).toContain("AI curation could not complete");
      expect(result.curation?.mode).toBe("rules");
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("caps NVIDIA NIM chat completions with its max_tokens parameter", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "nim-test-key");
    vi.stubEnv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1");
    vi.stubEnv("NVIDIA_NIM_MODEL", "deepseek-ai/deepseek-v4.1-flash");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeTruthy();
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-nim-test",
          object: "chat.completion",
          created: 1,
          model: "deepseek-ai/deepseek-v4.1-flash",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: '{"keptClaimIds":[]}' },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return structured JSON." },
          { role: "user", content: "Return no kept claim IDs." },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "nim-token-limit-v1",
        maxCompletionTokens: 200,
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
        max_tokens?: number;
        max_completion_tokens?: number;
        stream?: boolean;
        reasoning_effort?: string;
      };
      expect(requestBody.max_tokens).toBe(200);
      expect(requestBody).not.toHaveProperty("max_completion_tokens");
      expect(requestBody.stream).toBe(false);
      expect(requestBody.reasoning_effort).toBe("none");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("disables Nemotron thinking without sending a zero reasoning budget", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "nim-test-key");
    vi.stubEnv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1");
    vi.stubEnv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeTruthy();
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-nemotron-test",
          object: "chat.completion",
          created: 1,
          model: "nvidia/nemotron-3.5-lightning-30b-a3b",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: '{"keptClaimIds":[]}' },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return structured JSON." },
          { role: "user", content: "Return no kept claim IDs." },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "nemotron-reasoning-budget-v1",
        maxCompletionTokens: 200,
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
        reasoning_budget?: number;
        temperature?: number;
        chat_template_kwargs?: { enable_thinking?: boolean };
        messages?: Array<{ role: string; content: string }>;
      };
      expect(requestBody).not.toHaveProperty("reasoning_budget");
      expect(requestBody.temperature).toBe(0);
      expect(requestBody.chat_template_kwargs).toEqual({ enable_thinking: false });
      expect(requestBody.messages?.[0]?.content).toContain('"keptClaimIds"');
      expect(requestBody.messages?.[0]?.content).toContain(
        "Return JSON matching this schema exactly.",
      );
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it.each(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"])("provides strict JSON schema and supported reasoning options to Groq %s", async (model) => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", model);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.messages[0].content).toBe("Choose supported product claims.");
      expect(body.response_format.json_schema.schema.properties).toHaveProperty("keptClaimIds");
      expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
      if (model.includes("gpt-oss")) {
        expect(body.reasoning_effort).toBe("medium");
        expect(body).not.toHaveProperty("reasoning_format");
      }
      return new Response(JSON.stringify({ model, choices: [
        { message: { content: '{"keptClaimIds":[]}' }, finish_reason: "stop" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(campaignGenerator.requestStructuredAiJson({ task: "brandTextModel",
        messages: [{ role: "system", content: "Choose supported product claims." }],
        schema: claimCurationResultSchema, schemaName: "claim_curation", promptVersion: "schema-check", maxCompletionTokens: 200,
      })).resolves.toMatchObject({ value: { keptClaimIds: [] }, metadata: { success: true, provider: "groq" } });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("keeps optional editor styles in validated JSON mode", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_COPY_MODEL", "openai/gpt-oss-120b");
    const plan = validCreativeDesignPlan();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].content).toContain('"fontSize"');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: "stop" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(campaignGenerator.requestStructuredAiJson({ task: "copyModel",
        messages: [{ role: "system", content: "Design the canvas." }], schema: creativeDesignPlanSchema,
        schemaName: "canvas", promptVersion: "canvas-test", maxCompletionTokens: 200,
      })).resolves.toMatchObject({ value: { theme: plan.theme }, metadata: { success: true } });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });

  it("requires nullable claim links in nested strict review schemas", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", "openai/gpt-oss-20b");
    const finding = { channel: "x", statement: "Invented metric", reason: "No source", linkedClaimId: null };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      const item = body.response_format.json_schema.schema.properties.unsupportedStatements.items;
      expect(item.required).toEqual(["channel", "statement", "reason", "linkedClaimId"]);
      expect(item.additionalProperties).toBe(false);
      expect(item.properties.linkedClaimId.anyOf).toContainEqual({ type: "null" });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ unsupportedStatements: [finding] }) }, finish_reason: "stop" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(campaignGenerator.requestStructuredAiJson({ task: "criticModel",
        messages: [{ role: "system", content: "Review unsupported claims." }],
        schema: z.object({ unsupportedStatements: z.array(unsupportedStatementSchema) }),
        schemaName: "review", promptVersion: "review-test", maxCompletionTokens: 200,
      })).resolves.toMatchObject({ value: { unsupportedStatements: [finding] }, metadata: { success: true } });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it.each([2, 20])("honors a bounded Groq rate-limit delay of %s seconds once before retrying", async (seconds) => {
    vi.useFakeTimers();
    const create = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Rate limited"), {
      status: 429, headers: new Headers({ "retry-after": String(seconds) }),
    })).mockResolvedValue({ choices: [{ message: { content: '{"ok":true}' } }] });
    try {
      const request = campaignGenerator.requestChatJson({ client: { chat: { completions: { create } } } as never,
        model: "test", providerName: "groq", fallbackModels: [] }, [{ role: "user", content: "Return JSON." }], 100);
      const result = expect(request).resolves.toEqual({ ok: true });
      await vi.advanceTimersByTimeAsync(seconds * 1000 + 500);
      await result;
      expect(create).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("caps Groq rate-limit recovery at two retries", async () => {
    vi.useFakeTimers();
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("Rate limited"), {
      status: 429, headers: new Headers({ "retry-after": "2" }),
    }));
    try {
      const result = expect(campaignGenerator.requestChatJson({ client: { chat: { completions: { create } } } as never,
        model: "test", providerName: "groq", fallbackModels: [] }, [{ role: "user", content: "Return JSON." }], 100))
        .rejects.toThrow("Rate limited");
      await vi.advanceTimersByTimeAsync(5_000);
      await result;
      expect(create).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  it("does not wait through a long Groq quota window", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("Rate limited"), {
      status: 429, headers: new Headers({ "retry-after": "60" }),
    }));
    await expect(campaignGenerator.requestChatJson({ client: { chat: { completions: { create } } } as never,
      model: "test", providerName: "groq", fallbackModels: [] }, [{ role: "user", content: "Return JSON." }], 100))
      .rejects.toThrow("Rate limited");
    expect(create).toHaveBeenCalledOnce();
  });

  it("bounds GLM 5.3 Flash reasoning for structured requests", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "nim-test-key");
    vi.stubEnv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1");
    vi.stubEnv("NVIDIA_NIM_MODEL", "z-ai/glm-5.3-flash");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBeTruthy();
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          id: "chatcmpl-glm-test",
          object: "chat.completion",
          created: 1,
          model: "z-ai/glm-5.3-flash",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: '{"keptClaimIds":[]}' },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return structured JSON." },
          { role: "user", content: "Return no kept claim IDs." },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "glm-reasoning-effort-v1",
        maxCompletionTokens: 200,
      });

      const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
        reasoning_effort?: string;
      };
      expect(requestBody.reasoning_effort).toBe("low");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("retries one NVIDIA NIM server error and then accepts structured output", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "nim-test-key");
    vi.stubEnv("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1");
    vi.stubEnv("NVIDIA_NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
    const successResponse = new Response(
      JSON.stringify({
        id: "chatcmpl-nemotron-retry",
        object: "chat.completion",
        created: 1,
        model: "nvidia/nemotron-3.5-lightning-30b-a3b",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: '{"keptClaimIds":[]}' },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Internal Server Error" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(successResponse);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return structured JSON." },
          { role: "user", content: "Return no kept claim IDs." },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "nim-server-retry-v1",
        maxCompletionTokens: 200,
      });

      expect(result.value).toEqual({ keptClaimIds: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("loads and deduplicates the OpenRouter fallback model list", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-test-secret");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv(
      "OPENROUTER_FALLBACK_MODELS",
      "router/fallback-a, openrouter/free, router/fallback-a",
    );
    try {
      expect(getOpenAIProviderSetup("strategyModel")?.fallbackModels).toEqual([
        "router/fallback-a",
        "openrouter/free",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns structured metadata and logs no prompt content or credentials", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-test-secret");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    vi.stubEnv("OPENROUTER_STRATEGY_MODEL", "router/strategy-model");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "openrouter/free");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: 1,
          model: "router/actual-model",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: '{"keptClaimIds":[]}' },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return structured JSON." },
          { role: "user", content: "PRIVATE PROMPT CONTENT" },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "campaign-v2.1",
        maxCompletionTokens: 200,
      });

      expect(result.value).toEqual({ keptClaimIds: [] });
      expect(result.metadata).toMatchObject({
        task: "strategyModel",
        provider: "openrouter",
        model: "router/actual-model",
        promptVersion: "campaign-v2.1",
        success: true,
      });
      expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
      const logOutput = info.mock.calls.flat().join("\n");
      expect(logOutput).toContain('"success":true');
      expect(logOutput).not.toContain("PRIVATE PROMPT CONTENT");
      expect(logOutput).not.toContain("sk-or-v1-test-secret");
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      error.mockRestore();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it.each(["schema mismatch", "provider JSON validation failure"])("corrects %s without replacing model output", async (failure) => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-test-secret");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    const response = (content: string) =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-schema-retry",
          object: "chat.completion",
          created: 1,
          model: "router/test-model",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure === "schema mismatch" ? response('{"keptClaimIds":"bad-shape"}') :
        new Response(JSON.stringify({ error: { message: "Failed to generate JSON", code: "json_validate_failed" } }),
          { status: 400, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(response('{"keptClaimIds":[]}'));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await campaignGenerator.requestStructuredAiJson({
        task: "strategyModel",
        messages: [
          { role: "system", content: "Return the required structure." },
          { role: "user", content: "INPUT" },
        ],
        schema: claimCurationResultSchema,
        schemaName: "claim_curation",
        promptVersion: "schema-retry-v1",
        maxCompletionTokens: 200,
      });

      expect(result.value).toEqual({ keptClaimIds: [] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
        messages: Array<{ content: string }>;
      };
      expect(retryBody.messages.at(-1)?.content).toMatch(/valid JSON/i);
      expect(retryBody).not.toHaveProperty("reasoning");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("keeps validated AI channel copy instead of replacing it with templates", () => {
    const fallback = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x"],
    });
    const result = normalizeGenerationPayload(
      {
        angles: fallback.angles,
        creativeDirections: fallback.creativeDirections,
        outputs: [
          {
            ...fallback.outputs[0],
            primaryCopy: "Model-written launch copy with a different voice.",
            alternateHooks: ["A model-written hook"],
            linkedClaimIds: [],
          },
        ],
      },
      fallback,
    );

    expect(result.outputs[0].primaryCopy).toBe(
      "Model-written launch copy with a different voice.",
    );
    expect(result.outputs[0].primaryCopy).not.toBe(
      fallback.outputs[0].primaryCopy,
    );
    expect(result.outputs[0].alternateHooks).toEqual(["A model-written hook"]);
    expect(result.outputs[0].linkedClaimIds).toEqual([]);
  });

  it("rejects malformed channel output instead of filling it with a local draft", () => {
    const fallback = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x", "linkedin", "product_hunt", "reddit", "email", "threads"],
    });
    const partialOutputs = fallback.outputs.map((output, index) =>
      index < 5 ? output : { ...output, linkedClaimIds: undefined },
    );

    expect(() => parseAiCampaignResult(
      {
        mode: "ai",
        angles: fallback.angles,
        outputs: partialOutputs,
        creativeDirections: fallback.creativeDirections,
      },
      fallback.outputs.map((output) => output.channel),
      "openrouter",
    )).toThrow();
  });

  it("drops unapproved claim links while retaining model copy", () => {
    const fallback = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x"],
    });
    const result = normalizeGenerationPayload(
      {
        angles: fallback.angles,
        creativeDirections: fallback.creativeDirections,
        outputs: [
          {
            ...fallback.outputs[0],
            primaryCopy: "AI copy stays visible.",
            linkedClaimIds: ["not-approved"],
          },
        ],
      },
      fallback,
    );

    expect(result.outputs[0].primaryCopy).toBe("AI copy stays visible.");
    expect(result.outputs[0].linkedClaimIds).toEqual([]);
  });

  it("rejects missing AI channel outputs instead of reporting completed generation", () => {
    const fallback = generateDeterministicCampaign({
      brand: DEMO_BRAND,
      kind: "launch",
      goal: "Launch to founders who ship every week",
      updateDetails: "The first campaign workflow is now available.",
      audience: "Solo SaaS founders",
      launchDate: "",
      cta: "Try it",
      angle: DEMO_ANGLES[0],
      channels: ["x"],
    });

    expect(() => parseAiCampaignResult(
      {
        mode: "ai",
        angles: fallback.angles,
        creativeDirections: fallback.creativeDirections,
        outputs: [],
      },
      ["x"],
      "openrouter",
    )).toThrow();
  });
});
