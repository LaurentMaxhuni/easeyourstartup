import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDeterministicCreativeDesign,
  autoCurateClaims,
  generateDeterministicCampaign,
  getOpenAIProviderConfig,
  getOpenAIProviderSetup,
  getStructuredAiTimeoutMs,
  isAiGenerationEnabled,
  parseAiCampaignResult,
  normalizeGenerationPayload,
  normalizeCreativeDesignPayload,
  parseProviderCreativeDesign,
  parseStructuredJson,
  publicProviderError,
} from "@/lib/server/campaign-generator";
import * as campaignGenerator from "@/lib/server/campaign-generator";
import { claimCurationResultSchema } from "@/lib/contracts";
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

  it("maps provider layers to verified assets and keeps the design bounded", () => {
    const result = normalizeCreativeDesignPayload(
      validCreativeDesignPlan(),
      DEMO_COMPOSITION,
    );
    const image = result.elements.find((element) => element.kind === "image");
    const textLayers = result.elements.filter((element) => element.kind === "text");

    expect(result.theme.headingFontFamily).toBe("Outfit");
    expect(image).toMatchObject({
      kind: "image",
      x: 54,
      y: 12,
      width: 38,
      height: 64,
      src: DEMO_COMPOSITION.screenshotUrl,
    });
    expect(image).not.toHaveProperty("asset");
    expect(textLayers.map((element) => element.textRole)).toEqual([
      "headline",
      "cta",
    ]);
    expect(textLayers.every((element) => element.fontFamily === "Outfit")).toBe(true);
    for (const element of result.elements) {
      expect(element.x + element.width).toBeLessThanOrEqual(100);
      expect(element.y + element.height).toBeLessThanOrEqual(100);
    }
  });

  it("preserves supported rich layers using only supplied brand colors", () => {
    const plan = validCreativeDesignPlan();
    const { tokens } = DEMO_COMPOSITION;
    const result = normalizeCreativeDesignPayload(
      {
        ...plan,
        elements: [
          ...plan.elements,
          {
            id: "background-gradient",
            kind: "gradient",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            gradientFrom: tokens.background,
            gradientTo: tokens.foreground,
          },
          {
            id: "accent-shape",
            kind: "shape",
            shape: "circle",
            x: 76,
            y: 65,
            width: 15,
            height: 15,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            fill: tokens.accent,
          },
        ],
      },
      DEMO_COMPOSITION,
    );

    expect(result.elements.map((element) => element.kind)).toContain("gradient");
    expect(result.elements.map((element) => element.kind)).toContain("shape");
    expect(() =>
      parseProviderCreativeDesign(
        {
          ...plan,
          theme: { ...plan.theme, accent: "#000000" },
        },
        DEMO_COMPOSITION,
      ),
    ).toThrow("AI selected a accent color outside the supplied brand system.");
  });

  it("rejects text placed outside the canvas safe area", () => {
    const plan = validCreativeDesignPlan();
    const headline = plan.elements.find(
      (element) => element.id === "launch-headline",
    );
    if (!headline) throw new Error("The valid design plan needs a headline.");
    headline.x = 80;
    headline.width = 20;

    expect(() =>
      parseProviderCreativeDesign(plan, DEMO_COMPOSITION),
    ).toThrow("AI design placed readable text outside the canvas safe area.");
  });

  it("requires the AI to create both the headline and requested CTA", () => {
    const plan = validCreativeDesignPlan();
    plan.elements = plan.elements.filter(
      (element) => element.id !== "launch-cta",
    );

    expect(() =>
      normalizeCreativeDesignPayload(plan, DEMO_COMPOSITION),
    ).toThrow("AI design omitted the requested call to action.");
    expect(() =>
      createDeterministicCreativeDesign(DEMO_COMPOSITION),
    ).toThrow("AI must create the canvas; a template-based design is not available.");
  });
});

describe("provider creative design validation", () => {
  function validPlan() {
    return validCreativeDesignPlan();
  }

  it("maps the model's editable layers to verified assets", () => {
    const parsed = parseProviderCreativeDesign(
      {
        ...validPlan(),
        providerMetadata: "discarded",
      },
      DEMO_COMPOSITION,
    );
    const headline = parsed.elements.find(
      (element) => element.kind === "text" && element.textRole === "headline",
    );
    const image = parsed.elements.find((element) => element.kind === "image");
    const icon = parsed.elements.find((element) => element.kind === "icon");

    expect(headline).toMatchObject({
      kind: "text",
      text: "A launch visual made for your next big release",
      fontFamily: "Outfit",
    });
    expect(image).toMatchObject({
      kind: "image",
      x: 54,
      y: 12,
      width: 38,
      height: 64,
      src: DEMO_COMPOSITION.screenshotUrl,
    });
    expect(icon).toMatchObject({ kind: "icon", icon: "rocket-launch" });
    expect(image).not.toHaveProperty("asset");
    expect(parsed.elements).toHaveLength(4);
    expect(parsed).not.toHaveProperty("tokens");
    expect(parsed).not.toHaveProperty("text");
    expect(parsed).not.toHaveProperty("providerMetadata");
  });

  it("rejects an omitted requested CTA", () => {
    const plan = validPlan();
    plan.elements = plan.elements.filter((element) => element.id !== "launch-cta");
    expect(() => parseProviderCreativeDesign(plan, DEMO_COMPOSITION)).toThrow(
      "AI design omitted the requested call to action.",
    );
  });
});

describe("OpenAI-compatible provider configuration", () => {
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

  it("disables Nemotron's reasoning-token budget for structured requests", async () => {
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
      expect(requestBody.reasoning_budget).toBe(0);
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

  it("corrects valid JSON that fails the task schema", async () => {
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
      .mockResolvedValueOnce(response('{"keptClaimIds":"bad-shape"}'))
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
