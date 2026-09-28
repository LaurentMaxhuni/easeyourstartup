import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", () => ({
  requestStructuredAiJson: vi.fn(),
}));

import {
  generateCampaignStrategy,
  campaignStrategySchema,
} from "./strategy";
import {
  campaignStrategyModelResultSchema,
  strategyBriefFromInput,
} from "./strategy-schema";
import { requestStructuredAiJson } from "@/lib/server/campaign-generator";
import type { GenerateCampaignInput } from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";

const aiMock = vi.mocked(requestStructuredAiJson);
const mockMetadata = {
  task: "strategyModel" as const,
  provider: "openai" as const,
  model: "test-model",
  promptVersion: "test-v1",
  latencyMs: 0,
  success: true,
};

function inputWithChannels(channels: GenerateCampaignInput["channels"] = ["linkedin", "x"]): GenerateCampaignInput {
  return {
    brand: DEMO_BRAND,
    kind: "feature_update",
    goal: "Introduce the updated campaign workflow to solo founders",
    updateDetails: "The campaign workflow now creates a tailored draft for each selected channel.",
    audience: "Solo SaaS founders who ship often",
    launchDate: "2026-10-01",
    cta: "Build your launch campaign",
    angle: DEMO_ANGLES[1],
    channels,
  };
}

function strategyModelResult(channels: GenerateCampaignInput["channels"]) {
  return {
    positioning: "Turn each product change into a focused launch plan.",
    audienceInsight: "Founders need a repeatable way to explain what they shipped.",
    narrativeArc: {
      opening: "Shipping is only the start of a release.",
      development: "A clear update can give each channel a useful role.",
      close: "Invite the audience to take the next concrete step.",
    },
    keyMessages: [
      "Keep the product change at the center.",
      "Adapt the story to the channel.",
    ],
    channelApproaches: channels.map((channel) => ({
      channel,
      rationale: `${channel} readers need a useful, direct announcement.`,
      structure: "Lead with the change, add context, end with the supplied CTA.",
    })),
    supportingClaimIds: ["claim-campaign"],
  };
}

describe("Generation V2 campaign strategy", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    aiMock.mockReset();
  });

  it("validates separate brief, inference, and exact approved-evidence sections", () => {
    const input = inputWithChannels();
    const brief = strategyBriefFromInput(input);
    const result = strategyModelResult(input.channels);
    const strategy = campaignStrategySchema.parse({
      brief,
      inferred: {
        positioning: result.positioning,
        audienceInsight: result.audienceInsight,
        narrativeArc: result.narrativeArc,
        keyMessages: result.keyMessages,
        channelApproaches: result.channelApproaches,
      },
      evidence: {
        approvedClaims: input.brand.claims
          .filter((claim) => claim.approvalState === "approved")
          .map(({ id, text, sourceUrl, sourceExcerpt, confidence }) => ({
            id,
            text,
            sourceUrl,
            sourceExcerpt,
            confidence,
          })),
        supportingClaimIds: result.supportingClaimIds,
      },
    });

    expect(strategy).toMatchObject({ brief, inferred: expect.any(Object) });
    expect(strategy.inferred).not.toHaveProperty("approvedClaims");
    expect(strategy.evidence.approvedClaims[0].text).toBe(input.brand.claims[0].text);
    expect(campaignStrategySchema.safeParse({
      ...strategy,
      evidence: { ...strategy.evidence, supportingClaimIds: ["not-approved"] },
    }).success).toBe(false);
    expect(campaignStrategySchema.safeParse({
      ...strategy,
      inferred: {
        ...strategy.inferred,
        channelApproaches: [...strategy.inferred.channelApproaches].reverse(),
      },
    }).success).toBe(false);
  });

  it("keeps the user brief exact and includes only approved brand claims", async () => {
    const base = inputWithChannels(["product_hunt", "email"]);
    const input = {
      ...base,
      brand: {
        ...base.brand,
        claims: [
          ...base.brand.claims,
          {
            ...base.brand.claims[0],
            id: "pending-claim",
            approvalState: "pending" as const,
          },
          {
            ...base.brand.claims[0],
            id: "rejected-claim",
            approvalState: "rejected" as const,
          },
        ],
      },
    };
    aiMock.mockResolvedValue({
      value: strategyModelResult(input.channels),
      metadata: mockMetadata,
    });

    const strategy = await generateCampaignStrategy(input);

    expect(strategy.brief).toEqual(strategyBriefFromInput(input));
    expect(strategy.brief.cta).toBe(input.cta);
    expect(strategy.brief.angle).toEqual(input.angle);
    expect(strategy.brief.channels).toEqual(input.channels);
    expect(strategy.evidence.approvedClaims.map((claim) => claim.id)).toEqual(
      base.brand.claims.map((claim) => claim.id),
    );
    expect(strategy.evidence.approvedClaims.map((claim) => claim.id)).not.toContain("pending-claim");
    expect(strategy.evidence.approvedClaims.map((claim) => claim.id)).not.toContain("rejected-claim");
    expect(aiMock).toHaveBeenCalledWith(expect.objectContaining({
      task: "strategyModel",
      schema: campaignStrategyModelResultSchema,
      promptVersion: "generation-v2-strategy-v1",
    }));
  });

  it("rejects strategy references that do not match approved claim IDs", async () => {
    const input = inputWithChannels();
    aiMock.mockResolvedValue({
      value: {
        ...strategyModelResult(input.channels),
        supportingClaimIds: ["pending-claim"],
      },
      metadata: mockMetadata,
    });

    await expect(generateCampaignStrategy(input)).rejects.toThrow(
      /unapproved claim ID: pending-claim/i,
    );
  });

  it("rejects malformed inference and requires one channel approach per requested channel", () => {
    expect(campaignStrategyModelResultSchema.safeParse({}).success).toBe(false);
    const input = inputWithChannels(["linkedin", "x"]);
    aiMock.mockResolvedValue({ value: strategyModelResult(["x"]), metadata: mockMetadata });

    return expect(generateCampaignStrategy(input)).rejects.toThrow(/one approach for each requested channel/i);
  });

  it("uses only the brief and approved evidence when the strategy provider times out", async () => {
    const input = inputWithChannels(["linkedin", "threads"]);
    aiMock.mockRejectedValue(new Error("Request timed out."));

    const strategy = await generateCampaignStrategy(input);
    const approvedClaims = input.brand.claims
      .filter((claim) => claim.approvalState === "approved")
      .map((claim) => claim.id);

    expect(strategy.brief).toEqual(strategyBriefFromInput(input));
    expect(strategy.inferred.positioning).toBe(input.angle.summary);
    expect(strategy.inferred.channelApproaches.map(({ channel }) => channel)).toEqual(
      input.channels,
    );
    expect(strategy.evidence.approvedClaims.map(({ id }) => id)).toEqual(
      approvedClaims,
    );
    expect(strategy.evidence.supportingClaimIds).toEqual(approvedClaims);
  });

  it("does not use the fallback while AI generation is disabled", async () => {
    vi.stubEnv("AI_GENERATION_ENABLED", "false");

    await expect(generateCampaignStrategy(inputWithChannels())).rejects.toThrow(
      /AI generation is temporarily disabled/i,
    );
    expect(aiMock).not.toHaveBeenCalled();
  });
});
