import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", () => ({
  OpenRouterFreeModelQuotaError: class OpenRouterFreeModelQuotaError extends Error {},
  requestStructuredAiJson: vi.fn(),
}));

import {
  generateCampaignSchema,
  type GenerateCampaignInput,
} from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND, DEMO_OUTPUTS } from "@/lib/demo-data";
import { requestStructuredAiJson } from "@/lib/server/campaign-generator";
import {
  campaignDesignPlanSchema,
  type CampaignDesignPlan,
} from "@/lib/generation-v2/design-schema";
import {
  campaignDesignPlanToDirections,
  fallbackCampaignDesignPlan,
  normalizeCampaignDesignPlan,
  planCampaignDesign,
} from "./design-plan";
import {
  campaignStrategySchema,
  strategyBriefFromInput,
} from "./strategy-schema";

const requestStructuredAiJsonMock = vi.mocked(requestStructuredAiJson);

function makeInput(): GenerateCampaignInput {
  return generateCampaignSchema.parse({
    brand: {
      ...DEMO_BRAND,
      productScreenshotCandidates: [
        {
          url: "https://demo.easeyourstartup.com/images/product.png",
          sourceUrl: "https://demo.easeyourstartup.com/product",
          alt: "Campaign editor product screenshot",
        },
      ],
    },
    kind: "feature_update",
    goal: "Explain the campaign design workflow to solo founders",
    updateDetails: "A campaign plan now organizes the launch story.",
    audience: "Solo SaaS founders",
    launchDate: "",
    cta: DEMO_BRAND.cta,
    angle: DEMO_ANGLES[0],
    channels: ["linkedin"],
  });
}

function makeStrategy(input: GenerateCampaignInput) {
  const approvedClaims = input.brand.claims
    .filter((claim) => claim.approvalState === "approved")
    .map(({ id, text, sourceUrl, sourceExcerpt, confidence }) => ({
      id,
      text,
      sourceUrl,
      sourceExcerpt,
      confidence,
    }));

  return campaignStrategySchema.parse({
    brief: strategyBriefFromInput(input),
    inferred: {
      positioning: "Turn a product update into launch material.",
      audienceInsight: "Founders need a launch story after shipping.",
      narrativeArc: {
        opening: "Name the launch gap.",
        development: "Show the supported product capability.",
        close: "Offer the supplied next step.",
      },
      keyMessages: [
        "Use the supplied product update.",
        "Keep product proof source-backed.",
      ],
      channelApproaches: input.channels.map((channel) => ({
        channel,
        rationale: "Make the message fit the channel.",
        structure: "Opening, evidence, CTA.",
      })),
    },
    evidence: {
      approvedClaims,
      supportingClaimIds: approvedClaims.map((claim) => claim.id),
    },
  });
}

function makeComponent(
  overrides: Partial<CampaignDesignPlan["components"][number]> = {},
) {
  return {
    id: "cover",
    order: 0,
    kind: "cover" as const,
    layoutVariant: "editorial" as const,
    headline: "Turn product updates into launch stories",
    alignment: "left" as const,
    emphasis: "headline" as const,
    supportingClaimIds: [],
    ...overrides,
  };
}

function makePlan(
  components: unknown[],
): CampaignDesignPlan {
  return campaignDesignPlanSchema.parse({
    version: "1",
    brandAdaptation: {
      tone: "editorial",
      rationale: "Use the scanned product palette and typography.",
      theme: {
        background: "#245cf0",
        foreground: "#f4f3ef",
        accent: "#171917",
        headingFontFamily: "Outfit",
        bodyFontFamily: "Outfit",
        density: "comfortable",
        usesGradient: false,
      },
    },
    components,
  });
}

describe("campaign design plan schema", () => {
  it("bounds component kinds, layouts, and copy while applying safe defaults", () => {
    const plan = makePlan([makeComponent()]);

    expect(plan.components[0]).toMatchObject({
      kind: "cover",
      layoutVariant: "editorial",
      supportingCopy: "",
      body: "",
      screenshotRef: null,
    });

    expect(() =>
      campaignDesignPlanSchema.parse({
        ...plan,
        components: [{ ...plan.components[0], kind: "raw-html" }],
      }),
    ).toThrow();
    expect(() =>
      campaignDesignPlanSchema.parse({
        ...plan,
        components: [{ ...plan.components[0], order: 9 }],
      }),
    ).toThrow();
  });

  it("rejects duplicate ids and order values and screenshot refs on other kinds", () => {
    expect(() =>
      makePlan([
        makeComponent(),
        makeComponent({ order: 1, kind: "feature", layoutVariant: "feature" }),
      ]),
    ).toThrow(/unique/i);
    expect(() =>
      makePlan([
        makeComponent(),
        makeComponent({ id: "feature", kind: "feature", layoutVariant: "feature" }),
      ]),
    ).toThrow(/unique/i);
    expect(() =>
      makePlan([
        makeComponent({ screenshotRef: "product-screenshot-1" }),
      ]),
    ).toThrow(/only screenshot components/i);
  });
});

describe("campaign design plan normalization", () => {
  it("keeps fallback headlines short without repeating the announcement or inventing copy", () => {
    const input = { ...makeInput(), updateDetails: "Shared folders are available. Keep related projects in one folder." };
    const plan = fallbackCampaignDesignPlan(input, makeStrategy(input), [{ ...DEMO_OUTPUTS[1], primaryCopy: "Shared folders are available.\n\nKeep related projects in one folder." }]);
    expect(plan.components[0]).toMatchObject({
      headline: "Shared folders are available.",
      supportingCopy: "Keep related projects in one folder.",
    });
  });
  it("sorts components, renumbers order, and accepts only available screenshot refs", () => {
    const input = makeInput();
    const strategy = makeStrategy(input);
    const plan = makePlan([
      makeComponent({
        id: "screenshot",
        order: 2,
        kind: "screenshot",
        layoutVariant: "browser",
        screenshotRef: "product-screenshot-1",
        headline: "Keep the product in view",
      }),
      makeComponent({ id: "cover", order: 0 }),
      makeComponent({
        id: "feature",
        order: 1,
        kind: "feature",
        layoutVariant: "feature",
        headline: "Plan the campaign story",
      }),
    ]);

    const normalized = normalizeCampaignDesignPlan(plan, input, strategy);

    expect(normalized.components.map(({ id, order }) => [id, order])).toEqual([
      ["cover", 0],
      ["feature", 1],
      ["screenshot", 2],
    ]);
    expect(normalized.components[2].screenshotRef).toBe("product-screenshot-1");
  });

  it("rejects unavailable screenshot refs, unapproved claims, and invented theme values", () => {
    const input = makeInput();
    const strategy = makeStrategy(input);
    const badScreenshot = makePlan([
      makeComponent({
        id: "screenshot",
        kind: "screenshot",
        screenshotRef: "product-screenshot-2",
      }),
    ]);
    const badClaim = makePlan([
      makeComponent({ supportingClaimIds: ["not-approved"] }),
    ]);
    const badTheme = {
      ...makePlan([makeComponent()]),
      brandAdaptation: {
        ...makePlan([makeComponent()]).brandAdaptation,
        theme: {
          ...makePlan([makeComponent()]).brandAdaptation.theme,
          accent: "#f00f00",
        },
      },
    };

    expect(() => normalizeCampaignDesignPlan(badScreenshot, input, strategy)).toThrow(
      /not available/i,
    );
    expect(() => normalizeCampaignDesignPlan(badClaim, input, strategy)).toThrow(
      /approved campaign claims/i,
    );
    expect(() => normalizeCampaignDesignPlan(badTheme, input, strategy)).toThrow(
      /scanned brand palette/i,
    );
  });

  it("maps ordered plan components into editable creative directions", () => {
    const plan = makePlan([
      makeComponent({ id: "feature", order: 1, kind: "feature" }),
      makeComponent({ id: "cover", order: 0 }),
    ]);

    expect(campaignDesignPlanToDirections(plan)).toMatchObject([
      { id: "cover", label: "01 · Cover", layout: "editorial" },
      { id: "feature", label: "02 · Feature", layout: "editorial" },
    ]);
  });
});

describe("planCampaignDesign", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    requestStructuredAiJsonMock.mockReset();
  });

  it("keeps disabled AI generation as an error", async () => {
    const input = makeInput();
    vi.stubEnv("AI_GENERATION_ENABLED", "false");

    await expect(
      planCampaignDesign(input, makeStrategy(input), [DEMO_OUTPUTS[1]]),
    ).rejects.toMatchObject({
      name: "CampaignDesignPlanningError",
      recoverable: true,
    });
    expect(requestStructuredAiJsonMock).not.toHaveBeenCalled();
  });

  it("uses a normalized deterministic plan when the planner provider times out", async () => {
    const input = makeInput();
    vi.stubEnv("AI_GENERATION_ENABLED", "true");
    const strategy = makeStrategy(input);
    const generatedOutput = {
      ...DEMO_OUTPUTS[1],
      primaryCopy: `${input.updateDetails}\n\nA campaign plan now organizes the launch story.`,
    };
    requestStructuredAiJsonMock.mockRejectedValue(new Error("provider timed out"));

    const plan = await planCampaignDesign(input, strategy, [generatedOutput]);

    expect(plan.components).toEqual([
      expect.objectContaining({
        id: "launch-message",
        order: 0,
        headline: input.updateDetails,
        supportingCopy: "",
        cta: input.cta,
        supportingClaimIds: [],
        screenshotRef: null,
      }),
    ]);
    expect(plan.brandAdaptation.theme).toMatchObject({
      background: input.brand.visualSystem?.backgroundColor.toLowerCase(),
      foreground: input.brand.visualSystem?.foregroundColor.toLowerCase(),
      accent: input.brand.visualSystem?.accentColor.toLowerCase(),
      headingFontFamily: "Outfit",
      bodyFontFamily: "Outfit",
      usesGradient: input.brand.visualSystem?.usesGradient,
    });
    expect(requestStructuredAiJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "designPlannerModel",
        schemaName: "campaign_design_plan",
      }),
    );
    expect(() =>
      normalizeCampaignDesignPlan(
        {
          ...plan,
          components: [
            {
              ...plan.components[0],
              supportingClaimIds: ["not-approved"],
            },
          ],
        },
        input,
        strategy,
      ),
    ).toThrow(/approved campaign claims/i);
  });

  it.each([null, "product-screenshot-2"])("recovers with a typographic plan when AI selects an unavailable screenshot %s", async (screenshotRef) => {
    const input = makeInput();
    const strategy = makeStrategy(input);
    requestStructuredAiJsonMock.mockResolvedValue({ value: makePlan([
      makeComponent({ kind: "screenshot", screenshotRef }),
    ]), metadata: { task: "designPlannerModel", provider: "groq", model: "test", promptVersion: "2", latencyMs: 1, success: true } });
    const plan = await planCampaignDesign(input, strategy, [DEMO_OUTPUTS[1]]);
    expect(plan.components).toEqual([expect.objectContaining({ kind: "cover", screenshotRef: null })]);
  });
});
