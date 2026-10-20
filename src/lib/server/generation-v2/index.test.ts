import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateCampaignStrategy: vi.fn(),
  generatePlatformContent: vi.fn(),
  planCampaignDesign: vi.fn(),
  campaignDesignPlanToDirections: vi.fn(),
  assertApprovedClaimLinks: vi.fn(),
  reviewCampaignGeneration: vi.fn(),
  designCreativeComposition: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/campaign-generator")>(),
  designCreativeComposition: mocks.designCreativeComposition,
}));
vi.mock("./strategy", () => ({
  generateCampaignStrategy: mocks.generateCampaignStrategy,
}));
vi.mock("./content", () => ({
  generatePlatformContent: mocks.generatePlatformContent,
}));
vi.mock("./design-plan", () => ({
  planCampaignDesign: mocks.planCampaignDesign,
  campaignDesignPlanToDirections: mocks.campaignDesignPlanToDirections,
}));
vi.mock("./critic", async (importOriginal) => ({
  ...await importOriginal<typeof import("./critic")>(),
  assertApprovedClaimLinks: mocks.assertApprovedClaimLinks,
  reviewCampaignGeneration: mocks.reviewCampaignGeneration,
}));

import { generateCampaignV2 } from "./index";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";

const input = {
  brand: DEMO_BRAND,
  kind: "launch" as const,
  goal: "Introduce the campaign workflow to solo founders",
  updateDetails: "A new campaign workflow is now available.",
  audience: "Solo SaaS founders",
  launchDate: "",
  cta: "Try the free scan",
  angle: DEMO_ANGLES[0],
  channels: ["x" as const],
};

const output = {
  channel: "x" as const,
  primaryCopy: "A focused launch note for solo founders.",
  alternateHooks: ["Make the next launch easier."],
  cta: input.cta,
  hashtags: [],
  linkedClaimIds: [],
  warnings: [],
  associatedCreativeIds: [],
};

const direction = {
  id: "cover",
  label: "Cover",
  layout: "editorial" as const,
  icon: "sparkle" as const,
  graphic: "orbit" as const,
  imageMode: "single" as const,
  eyebrow: "A clearer launch",
  headline: "Make your launch easier to plan",
  subheadline: "One focused story for each channel.",
  body: "Start with the details your audience needs.",
  cta: input.cta,
  footer: "",
};

function assessment(
  needsRewrite: boolean,
  unsupported = false,
  feedback?: string[],
) {
  return {
    scores: {
      specificity: needsRewrite ? 40 : 90,
      factualAccuracy: 95,
      brandFit: 90,
      hookQuality: 90,
      clarity: 90,
      platformFit: 90,
      genericLanguage: 90,
      visualContentConsistency: 90,
    },
    feedback: feedback ?? (needsRewrite ? ["Make the opening more specific."] : []),
    unsupportedStatements: unsupported
      ? [{ channel: "x" as const, statement: "Unsupported feature claim", reason: "No approved evidence." }]
      : [],
    needsRewrite,
  };
}

describe("Generation V2 orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateCampaignStrategy.mockResolvedValue({
      brief: { campaign: "brief" },
      inferred: { positioning: "focused" },
      evidence: { approvedClaims: [], supportingClaimIds: [] },
    });
    mocks.generatePlatformContent.mockResolvedValue([output]);
    mocks.planCampaignDesign.mockResolvedValue({
      version: "1",
      brandAdaptation: { tone: "editorial", theme: {} },
      components: [{ ...direction, order: 0, kind: "cover", supportingCopy: direction.subheadline }],
    });
    mocks.campaignDesignPlanToDirections.mockReturnValue([direction]);
    mocks.reviewCampaignGeneration.mockResolvedValue(assessment(false));
    mocks.designCreativeComposition.mockResolvedValue({
      design: {
        theme: { background: "#ffffff", foreground: "#111827", accent: "#245cf0", headingFontFamily: "Outfit", bodyFontFamily: "Outfit" },
        elements: [{ id: "unreviewed", kind: "text", textRole: "headline", text: "Unreviewed replacement copy", x: 8, y: 10, width: 80, height: 30, rotation: 0, opacity: 1, locked: false, hidden: false }],
      },
    });
  });

  it("uses AI-authored geometry with the reviewed copy as its only wording options", async () => {
    mocks.planCampaignDesign.mockResolvedValue({
      version: "1",
      brandAdaptation: {
        tone: "editorial", rationale: "Use the brand palette.",
        theme: { background: "#ffffff", foreground: "#111827", accent: "#245cf0", headingFontFamily: "Outfit", bodyFontFamily: "Outfit", density: "comfortable", usesGradient: false },
      },
      components: [{ ...direction, order: 0, kind: "cover", layoutVariant: "editorial", supportingCopy: direction.subheadline, alignment: "left", emphasis: "headline", supportingClaimIds: [], screenshotRef: null }],
    });
    const design = {
      theme: { background: "#ffffff", foreground: "#111827", accent: "#245cf0", headingFontFamily: "Outfit", bodyFontFamily: "Outfit" },
      elements: [{ id: "bespoke-headline", kind: "text", textRole: "headline", text: direction.headline, x: 27, y: 41, width: 65, height: 24, rotation: -3, opacity: 1, locked: false, hidden: false }],
    };
    mocks.designCreativeComposition.mockResolvedValue({ design });
    const result = await generateCampaignV2(input);
    expect(result.creativeDesign?.elements.find((element) => element.textRole === "headline")?.text).toBe(direction.headline);
    expect(result.creativeDesign).toEqual(design);
    expect(mocks.designCreativeComposition).toHaveBeenCalledWith(expect.objectContaining({
      brand: input.brand,
      copyCandidates: [direction.eyebrow, direction.headline, direction.subheadline, direction.body, direction.cta],
      composition: expect.objectContaining({ text: expect.objectContaining({ headline: direction.headline, cta: direction.cta }) }),
    }));
  });

  it("fails generation when custom canvas design fails instead of returning a template", async () => {
    mocks.designCreativeComposition.mockRejectedValue(new Error("Custom design failed"));
    await expect(generateCampaignV2(input)).rejects.toThrow("Custom design failed");
  });

  it("stores strategy, design plan, and review in the validated result", async () => {
    const result = await generateCampaignV2(input, { includeCreativeDesign: false });

    expect(result.generationVersion).toBe("v2");
    expect(result.generationV2).toMatchObject({
      strategy: { inferred: { positioning: "focused" } },
      designPlan: { version: "1" },
      review: { needsRewrite: false },
    });
    expect(result.outputs).toEqual([output]);
    expect(mocks.generatePlatformContent).toHaveBeenCalledTimes(1);
    expect(mocks.assertApprovedClaimLinks).toHaveBeenCalledTimes(1);
  });

  it("allows exactly one critic-guided rewrite and replans its visuals", async () => {
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true))
      .mockResolvedValueOnce(assessment(false));

    const result = await generateCampaignV2(input, { includeCreativeDesign: false });

    expect(result.generationV2?.review).toMatchObject({ needsRewrite: false });
    expect(mocks.generatePlatformContent).toHaveBeenCalledTimes(2);
    expect(mocks.generatePlatformContent.mock.calls[1]?.[2]).toContain(
      "Make the opening more specific.",
    );
    expect(mocks.generatePlatformContent.mock.calls[1]?.[3]).toEqual([output]);
    expect(mocks.planCampaignDesign).toHaveBeenCalledTimes(2);
    expect(mocks.reviewCampaignGeneration).toHaveBeenCalledTimes(2);
  });

  it("limits a factual rewrite to the channel named by the critic", async () => {
    const channels = ["linkedin", "instagram", "threads"] as const;
    const multiChannelInput = { ...input, channels: [...channels] };
    const drafts = channels.map((channel) => ({
      ...output,
      channel,
      primaryCopy: `Original ${channel} copy.`,
    }));
    const firstReview = {
      ...assessment(false, true),
      needsRewrite: true,
      unsupportedStatements: [
        {
          channel: "linkedin" as const,
          statement: "Unsupported LinkedIn claim",
          reason: "No approved evidence.",
        },
      ],
    };
    mocks.generatePlatformContent
      .mockResolvedValueOnce(drafts)
      .mockResolvedValueOnce(drafts);
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(firstReview)
      .mockResolvedValueOnce(assessment(false));

    await generateCampaignV2(multiChannelInput, { includeCreativeDesign: false });

    expect(mocks.generatePlatformContent).toHaveBeenCalledTimes(2);
    expect(mocks.generatePlatformContent.mock.calls[1]?.[3]).toEqual(drafts);
    expect(mocks.generatePlatformContent.mock.calls[1]?.[4]).toEqual([
      "linkedin",
    ]);
  });

  it("rewrites all channels when weak writing accompanies a channel-specific factual finding", async () => {
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true, true))
      .mockResolvedValueOnce(assessment(false));
    await generateCampaignV2(input, { includeCreativeDesign: false });
    expect(mocks.generatePlatformContent.mock.calls[1]?.[4]).toBeUndefined();
  });

  it("includes unsupported findings when reviewer feedback is empty", async () => {
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true, true, []))
      .mockResolvedValueOnce(assessment(false));

    await generateCampaignV2(input, { includeCreativeDesign: false });

    const rewriteFeedback = mocks.generatePlatformContent.mock.calls[1]?.[2];
    expect(rewriteFeedback).toContain('"statement":"Unsupported feature claim"');
    expect(rewriteFeedback).toContain('"reason":"No approved evidence."');
    expect(rewriteFeedback).toContain("Remove or narrow each flagged factual statement");
    expect(rewriteFeedback.length).toBeLessThanOrEqual(2000);
  });

  it("keeps exact unsupported findings when reviewer feedback exceeds the schema limit", async () => {
    const firstFeedback = `Preserve this reviewer guidance: ${"x".repeat(367)}`;
    const oversizedFeedback = [
      firstFeedback,
      ...Array.from({ length: 11 }, () => "y".repeat(400)),
    ];
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true, true, oversizedFeedback))
      .mockResolvedValueOnce(assessment(false));

    await generateCampaignV2(input, { includeCreativeDesign: false });

    const rewriteFeedback = mocks.generatePlatformContent.mock.calls[1]?.[2];
    expect(rewriteFeedback).toContain('"statement":"Unsupported feature claim"');
    expect(rewriteFeedback).toContain('"reason":"No approved evidence."');
    expect(rewriteFeedback).toContain(firstFeedback);
    expect(rewriteFeedback.length).toBeLessThanOrEqual(2000);
  });

  it("does not return a campaign with unsupported statements after rewrite", async () => {
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true))
      .mockResolvedValueOnce(assessment(true, true))
      .mockResolvedValueOnce(assessment(true, true));

    await expect(generateCampaignV2(input)).rejects.toThrow(
      /unsupported factual statements/i,
    );
    expect(mocks.generatePlatformContent).toHaveBeenCalledTimes(2);
    expect(mocks.reviewCampaignGeneration).toHaveBeenCalledTimes(3);
  });

  it("removes exact reviewer-flagged sentences before one final safety review", async () => {
    const flaggedCopy = "A clear launch. Unsupported feature claim. A useful close.";
    mocks.generatePlatformContent
      .mockResolvedValueOnce([{ ...output, primaryCopy: flaggedCopy }])
      .mockResolvedValueOnce([{ ...output, primaryCopy: flaggedCopy }]);
    mocks.reviewCampaignGeneration
      .mockResolvedValueOnce(assessment(true, true))
      .mockResolvedValueOnce(assessment(true, true))
      .mockResolvedValueOnce(assessment(false));

    const result = await generateCampaignV2(input, { includeCreativeDesign: false });

    expect(result.outputs[0]?.primaryCopy).toBe("A clear launch.\n\nA useful close.");
    expect(result.outputs[0]?.alternateHooks).toEqual([]);
    expect(result.generationV2?.review.needsRewrite).toBe(false);
    expect(mocks.planCampaignDesign).toHaveBeenCalledTimes(3);
    expect(mocks.reviewCampaignGeneration).toHaveBeenCalledTimes(3);
    expect(mocks.assertApprovedClaimLinks).toHaveBeenCalledTimes(1);
  });
});
