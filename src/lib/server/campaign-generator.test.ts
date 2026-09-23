import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDeterministicCreativeDesign,
  autoCurateClaims,
  generateDeterministicCampaign,
  getOpenAIProviderConfig,
  isAiGenerationEnabled,
  parseAiCampaignResult,
  normalizeGenerationPayload,
  normalizeCreativeDesignPayload,
  parseStructuredJson,
} from "@/lib/server/campaign-generator";
import * as campaignGenerator from "@/lib/server/campaign-generator";
import { claimCurationResultSchema } from "@/lib/contracts";
import {
  DEMO_ANGLES,
  DEMO_BRAND,
  DEMO_COMPOSITION,
  DEMO_SCAN,
} from "@/lib/demo-data";

describe("source-backed campaign generation", () => {
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

  it("keeps AI canvas designs bounded and compositionally intentional", () => {
    const result = normalizeCreativeDesignPayload(
      {
        templateId: "split",
        imageMode: "single",
        tokens: {
          background: "#245cf0",
          foreground: "#f4f3ef",
          accent: "#171917",
          fontFamily: "Playfair Display",
        },
        text: DEMO_COMPOSITION.text,
        elements: [
          {
            id: "hero-image",
            kind: "image",
            asset: "primary",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
          {
            id: "headline-one",
            kind: "text",
            textRole: "headline",
            text: "Make the launch clearer",
            x: 7,
            y: 14,
            width: 48,
            height: 20,
            fontSize: 20,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
          {
            id: "headline-two",
            kind: "text",
            textRole: "headline",
            text: "Duplicate headline",
            x: 8,
            y: 38,
            width: 48,
            height: 20,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
          {
            id: "shape-one",
            kind: "shape",
            shape: "rectangle",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 0.8,
            locked: false,
            hidden: false,
          },
          {
            id: "shape-two",
            kind: "shape",
            shape: "circle",
            x: 8,
            y: 8,
            width: 22,
            height: 22,
            rotation: 0,
            opacity: 0.5,
            locked: false,
            hidden: false,
          },
          {
            id: "cta-one",
            kind: "text",
            textRole: "cta",
            text: "Try it now",
            x: 8,
            y: 78,
            width: 26,
            height: 7,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
        ],
      },
      DEMO_COMPOSITION,
    );

    const textRoles = result.elements
      .filter((element) => element.kind === "text")
      .map((element) => element.textRole)
      .filter((role) => Boolean(role));
    const imageElements = result.elements.filter(
      (element) => element.kind === "image",
    );
    const shapeElements = result.elements.filter(
      (element) => element.kind === "shape",
    );
    const headline = result.elements.find(
      (element) => element.kind === "text" && element.textRole === "headline",
    );

    expect(result.elements.length).toBeLessThanOrEqual(16);
    expect(result.tokens.fontFamily).toBe(DEMO_COMPOSITION.tokens.fontFamily);
    expect(imageElements).toHaveLength(1);
    expect(imageElements[0].x).toBeGreaterThanOrEqual(2);
    expect(imageElements[0].width).toBeLessThanOrEqual(60);
    expect(shapeElements.length).toBeLessThanOrEqual(2);
    expect(headline?.fontSize).toBeLessThanOrEqual(5.2);
    expect(new Set(textRoles).size).toBe(textRoles.length);
    expect(textRoles).toEqual(expect.arrayContaining(["headline", "cta"]));
  });

  it("normalizes rich layers without inventing a gradient treatment", () => {
    const result = normalizeCreativeDesignPayload(
      {
        templateId: "editorial",
        imageMode: "single",
        tokens: DEMO_COMPOSITION.tokens,
        text: DEMO_COMPOSITION.text,
        elements: [
          {
            id: "background-wash",
            kind: "gradient",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            gradientFrom: "#101828",
            gradientTo: "#245cf0",
            gradientAngle: 225,
            effect: "drift",
            effectTrigger: "always",
          },
          {
            id: "feature-icon",
            kind: "icon",
            x: 76,
            y: 12,
            width: 13,
            height: 13,
            icon: "sparkle",
            effect: "pulse",
            effectTrigger: "hover",
            shadow: "glow",
          },
          {
            id: "primary-image",
            kind: "image",
            asset: "primary",
            x: 52,
            y: 24,
            width: 40,
            height: 58,
          },
          {
            id: "rich-headline",
            kind: "text",
            textRole: "headline",
            text: "Make the launch clearer",
            x: 8,
            y: 16,
            width: 42,
            height: 20,
            effect: "rise",
          },
        ],
      },
      DEMO_COMPOSITION,
    );

    expect(result.elements.map((element) => element.kind)).toEqual(
      expect.arrayContaining(["image", "icon", "text"]),
    );
    expect(result.elements.some((element) => element.kind === "gradient")).toBe(false);
    expect(result.elements.find((element) => element.kind === "icon")?.effectTrigger).toBe("hover");
  });

  it("uses art-directed layout slots instead of trusting arbitrary model coordinates", () => {
    const result = normalizeCreativeDesignPayload(
      {
        templateId: "editorial",
        imageMode: "single",
        tokens: DEMO_COMPOSITION.tokens,
        text: DEMO_COMPOSITION.text,
        elements: [
          {
            id: "wild-image",
            kind: "image",
            asset: "primary",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
          {
            id: "wild-headline",
            kind: "text",
            textRole: "headline",
            text: "A clear launch story",
            x: 82,
            y: 81,
            width: 12,
            height: 4,
            fontSize: 20,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
          },
        ],
      },
      DEMO_COMPOSITION,
    );

    const headline = result.elements.find(
      (element) => element.kind === "text" && element.textRole === "headline",
    );
    const image = result.elements.find((element) => element.kind === "image");
    const gradient = result.elements.find((element) => element.kind === "gradient");

    expect(gradient).toBeUndefined();
    expect(headline).toMatchObject({ x: 8, y: 15, width: 84 });
    expect(headline?.fontSize).toBeLessThanOrEqual(5.2);
    expect(image).toMatchObject({ x: 36, y: 64, width: 60, height: 27 });
    expect(headline && image).toBeTruthy();
    expect(
      headline &&
        image &&
        (headline.x < image.x + image.width &&
          headline.x + headline.width > image.x &&
          headline.y < image.y + image.height &&
          headline.y + headline.height > image.y),
    ).toBe(false);
  });

  it("fills a complete editable scene when the model returns sparse layers", () => {
    const layouts = [
      "browser",
      "phone",
      "launch-card",
      "split",
      "editorial",
      "quote",
      "feature",
    ] as const;

    for (const layout of layouts) {
      const result = normalizeCreativeDesignPayload(
        {
          templateId: layout,
          imageMode: layout === "feature" ? "devices" : "single",
          tokens: DEMO_COMPOSITION.tokens,
          text: DEMO_COMPOSITION.text,
          elements: [],
        },
        DEMO_COMPOSITION,
      );

      expect(result.elements.length).toBeGreaterThanOrEqual(8);
      expect(result.elements[0].kind).toBe("shape");
      expect(result.elements.some((element) => element.kind === "icon")).toBe(true);
      expect(result.elements.some((element) => element.kind === "shape")).toBe(true);
      expect(result.elements.filter((element) => element.kind === "image")).toHaveLength(
        layout === "feature" ? 3 : 1,
      );
      for (const element of result.elements) {
        expect(element.x + element.width).toBeLessThanOrEqual(100);
        expect(element.y + element.height).toBeLessThanOrEqual(100);
      }
    }
  });

  it("provides a complete local design when the AI provider is unavailable", () => {
    const result = createDeterministicCreativeDesign(DEMO_COMPOSITION);
    const cta = result.elements.find(
      (element) => element.kind === "text" && element.textRole === "cta",
    );
    const image = result.elements.find((element) => element.kind === "image");

    expect(result.elements.length).toBeGreaterThanOrEqual(8);
    expect(result.elements[0].kind).toBe("shape");
    expect(result.elements.some((element) => element.kind === "image")).toBe(true);
    expect(result.elements.some((element) => element.kind === "text")).toBe(true);
    expect(cta?.color).toBe("#171917");
    expect(image).toMatchObject({ x: 57, y: 17, width: 36, height: 58 });
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
      expect(create.mock.calls[1][0]).toMatchObject({
        reasoning: { effort: "none" },
      });
      expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({
        role: "user",
        content: expect.stringMatching(/valid JSON/i),
      });
    },
  );

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
