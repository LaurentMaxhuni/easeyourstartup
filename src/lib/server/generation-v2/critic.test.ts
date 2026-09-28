import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", () => ({
  OpenRouterFreeModelQuotaError: class OpenRouterFreeModelQuotaError extends Error {},
  requestStructuredAiJson: vi.fn(),
}));

import type { ChannelOutput, GenerateCampaignInput } from "@/lib/contracts";
import { requestStructuredAiJson } from "@/lib/server/campaign-generator";
import {
  assertApprovedClaimLinks,
  campaignGenerationReviewSchema,
  findUnsupportedClaimLinks,
  reviewCampaignGeneration,
  UnsupportedGenerationClaimError,
} from "./critic";
import {
  campaignInputForEvaluationFixture,
  GENERATION_V2_EVALUATION_FIXTURES,
} from "./evaluation-fixtures";
import { campaignDesignPlanSchema } from "@/lib/generation-v2/design-schema";
import { campaignStrategySchema } from "./strategy-schema";

const requestStructuredAiJsonMock = vi.mocked(requestStructuredAiJson);

function strategyFor(input: GenerateCampaignInput) {
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
    brief: {
      brandName: input.brand.projectName,
      brandTagline: input.brand.tagline,
      brandVoice: input.brand.voice,
      kind: input.kind,
      goal: input.goal,
      updateDetails: input.updateDetails,
      audience: input.audience,
      launchDate: input.launchDate,
      cta: input.cta,
      angle: input.angle,
      channels: input.channels,
    },
    inferred: {
      positioning: "Lead with the documented product capability.",
      audienceInsight: "Keep the message relevant to the requested audience.",
      narrativeArc: {
        opening: "State the capability.",
        development: "Explain it plainly.",
        close: "Offer one next step.",
      },
      keyMessages: ["State the product capability", "Close with one clear action"],
      channelApproaches: input.channels.map((channel) => ({
        channel,
        rationale: "Match the channel's reading context.",
        structure: "Opening, explanation, CTA.",
      })),
    },
    evidence: {
      approvedClaims,
      supportingClaimIds: approvedClaims.map((claim) => claim.id),
    },
  });
}

function designPlanFor() {
  return campaignDesignPlanSchema.parse({
    version: "1",
    brandAdaptation: {
      tone: "technical",
      rationale: "Use a clear, product-led presentation.",
      theme: {
        background: "#ffffff",
        foreground: "#171717",
        accent: "#635bff",
        headingFontFamily: "Outfit",
        bodyFontFamily: "Outfit",
        density: "comfortable",
        usesGradient: false,
      },
    },
    components: [
      {
        id: "cover",
        order: 0,
        kind: "cover",
        layoutVariant: "editorial",
        headline: "A documented product capability",
        alignment: "left",
        emphasis: "headline",
        supportingClaimIds: [],
      },
    ],
  });
}

function outputFor(
  input: GenerateCampaignInput,
  linkedClaimIds = input.brand.claims
    .filter((claim) => claim.approvalState === "approved")
    .map((claim) => claim.id),
): ChannelOutput[] {
  return input.channels.map((channel) => ({
    channel,
    primaryCopy: `${input.updateDetails}\n\n${input.cta}`,
    alternateHooks: [input.brand.projectName],
    cta: input.cta,
    hashtags: [],
    linkedClaimIds,
    warnings: [],
    associatedCreativeIds: [],
  }));
}

const strongAssessment = {
  scores: {
    specificity: 92,
    factualAccuracy: 96,
    brandFit: 90,
    hookQuality: 86,
    clarity: 94,
    platformFit: 88,
    genericLanguage: 93,
    visualContentConsistency: 91,
  },
  feedback: ["Lead with the source-backed product capability."],
  unsupportedStatements: [],
};

const metadata = {
  task: "criticModel" as const,
  provider: "openai" as const,
  model: "test-model",
  promptVersion: "generation-v2-critic-v1",
  latencyMs: 1,
  success: true,
};

describe("Generation V2 critic evaluation fixtures", () => {
  it("contains three distinct first-party, source-backed startup profiles", () => {
    expect(GENERATION_V2_EVALUATION_FIXTURES.map((fixture) => fixture.id)).toEqual([
      "stripe",
      "figma",
      "linear",
    ]);

    for (const fixture of GENERATION_V2_EVALUATION_FIXTURES) {
      expect(fixture.sourceUrl).toMatch(/^https:\/\//);
      expect(fixture.sourceExcerpt.length).toBeGreaterThan(20);
      expect(fixture.profile.claims).toHaveLength(1);
      expect(fixture.profile.claims[0]).toMatchObject({
        approvalState: "approved",
        sourceUrl: fixture.sourceUrl,
        sourceExcerpt: fixture.sourceExcerpt,
        text: fixture.sourceExcerpt,
      });
      expect(fixture.sourceExcerpt).not.toMatch(/[$€£]|\b\d+%|\b\d+\s?(?:million|billion)/i);
    }

    expect(campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[0]))
      .toMatchObject({ brand: { projectName: "Stripe" }, cta: "Explore Stripe" });
  });
});

describe("approved claim link guard", () => {
  it("accepts strategy, design, and channel links to exact approved evidence", () => {
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[0]);
    const strategy = strategyFor(input);
    const designPlan = designPlanFor();

    expect(
      findUnsupportedClaimLinks({
        input,
        strategy,
        outputs: outputFor(input),
        designPlan,
      }),
    ).toEqual([]);
    expect(() =>
      assertApprovedClaimLinks({
        input,
        strategy,
        outputs: outputFor(input),
        designPlan,
      }),
    ).not.toThrow();
  });

  it("marks and rejects a channel link to a pending or unknown claim", () => {
    const fixtureInput = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[0]);
    const input = {
      ...fixtureInput,
      brand: {
        ...fixtureInput.brand,
        claims: [
          ...fixtureInput.brand.claims,
          {
            ...fixtureInput.brand.claims[0],
            id: "pending-claim",
            approvalState: "pending" as const,
          },
        ],
      },
    };
    const strategy = strategyFor(input);
    const designPlan = designPlanFor();
    const outputs = outputFor(input, ["pending-claim"]);

    expect(
      findUnsupportedClaimLinks({ input, strategy, outputs, designPlan }),
    ).toMatchObject([
      {
        location: "output",
        channel: "linkedin",
        claimId: "pending-claim",
        issue: "unapproved_claim_id",
      },
      {
        location: "output",
        channel: "email",
        claimId: "pending-claim",
        issue: "unapproved_claim_id",
      },
    ]);
    expect(() =>
      assertApprovedClaimLinks({ input, strategy, outputs, designPlan }),
    ).toThrow(UnsupportedGenerationClaimError);
  });

  it("rejects modified strategy evidence and unapproved design references", () => {
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[0]);
    const validStrategy = strategyFor(input);
    const strategy = {
      ...validStrategy,
      evidence: {
        ...validStrategy.evidence,
        approvedClaims: validStrategy.evidence.approvedClaims.map((claim) => ({
          ...claim,
          text: `${claim.text} Claims market leadership.`,
        })),
      },
    };
    const validDesignPlan = designPlanFor();
    const designPlan = campaignDesignPlanSchema.parse({
      ...validDesignPlan,
      components: [
        {
          ...validDesignPlan.components[0],
          supportingClaimIds: ["claim-not-approved"],
        },
      ],
    });

    expect(
      findUnsupportedClaimLinks({
        input,
        strategy,
        outputs: outputFor(input),
        designPlan,
      }),
    ).toMatchObject([
      { location: "strategy.approvedClaims", issue: "changed_evidence" },
      {
        location: "designPlan.component",
        componentId: "cover",
        issue: "unapproved_claim_id",
      },
    ]);
  });
});

describe("reviewCampaignGeneration", () => {
  beforeEach(() => {
    requestStructuredAiJsonMock.mockReset();
  });

  it("asks the critic to flag only explicit unsupported facts and quote the exact wording", async () => {
    requestStructuredAiJsonMock.mockResolvedValue({
      value: strongAssessment,
      metadata,
    });
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[2]);

    await reviewCampaignGeneration({
      input,
      strategy: strategyFor(input),
      outputs: outputFor(input),
      designPlan: designPlanFor(),
    });

    const request = requestStructuredAiJsonMock.mock.calls[0]?.[0];
    expect(request?.promptVersion).toBe("generation-v2-critic-v2");
    expect(request?.messages[0]?.content).toContain(
      "Report an unsupported statement only when it is an explicit, checkable factual assertion",
    );
    expect(request?.messages[0]?.content).toContain(
      "quote the exact unsupported wording from the campaign",
    );
    expect(request?.messages[0]?.content).toContain("Do not flag aspirations, goals, subjective positioning");
  });

  it("does not let perfect AI scores override an unapproved claim link", async () => {
    requestStructuredAiJsonMock.mockResolvedValue({
      value: strongAssessment,
      metadata,
    });
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[1]);
    const result = await reviewCampaignGeneration({
      input,
      strategy: strategyFor(input),
      outputs: outputFor(input, ["foreign-claim"]),
      designPlan: designPlanFor(),
    });

    expect(campaignGenerationReviewSchema.safeParse(result).success).toBe(true);
    expect(result.needsRewrite).toBe(true);
    expect(result.unsupportedStatements).toContainEqual(
      expect.objectContaining({
        statement: "Unapproved claim reference at output.",
        linkedClaimId: "foreign-claim",
      }),
    );
  });

  it("fails closed when review is unavailable and deterministic links pass", async () => {
    requestStructuredAiJsonMock.mockRejectedValue(new Error("provider unavailable"));
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[2]);
    await expect(
      reviewCampaignGeneration({
        input,
        strategy: strategyFor(input),
        outputs: outputFor(input),
        designPlan: designPlanFor(),
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/quality review is unavailable/i),
      cause: expect.objectContaining({ message: "provider unavailable" }),
    });
  });

  it("fails closed if critic generation fails while a critical link is unsupported", async () => {
    requestStructuredAiJsonMock.mockRejectedValue(new Error("provider unavailable"));
    const input = campaignInputForEvaluationFixture(GENERATION_V2_EVALUATION_FIXTURES[2]);

    await expect(
      reviewCampaignGeneration({
        input,
        strategy: strategyFor(input),
        outputs: outputFor(input, ["foreign-claim"]),
        designPlan: designPlanFor(),
      }),
    ).rejects.toThrow(UnsupportedGenerationClaimError);
  });

  it("exports the final review schema with bounded scores and deterministic rewrite state", () => {
    expect(
      campaignGenerationReviewSchema.safeParse({
        ...strongAssessment,
        needsRewrite: false,
      }).success,
    ).toBe(true);
    expect(
      campaignGenerationReviewSchema.safeParse({
        ...strongAssessment,
        scores: { ...strongAssessment.scores, clarity: 101 },
        needsRewrite: false,
      }).success,
    ).toBe(false);
  });
});
