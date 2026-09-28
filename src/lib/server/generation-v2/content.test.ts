import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", () => ({
  requestStructuredAiJson: vi.fn(),
}));

import { generatePlatformContent } from "./content";
import { platformCopyResponseSchema } from "./content-schema";
import { campaignStrategySchema } from "./strategy-schema";
import { requestStructuredAiJson } from "@/lib/server/campaign-generator";
import {
  channelOutputSchema,
  type Channel,
  type GenerateCampaignInput,
} from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";

const aiMock = vi.mocked(requestStructuredAiJson);

const CHANNELS: Channel[] = [
  "product_hunt",
  "linkedin",
  "x",
  "reddit",
  "hacker_news",
  "instagram",
  "threads",
  "facebook",
  "email",
];

function inputWithChannels(channels: Channel[] = CHANNELS): GenerateCampaignInput {
  return {
    brand: DEMO_BRAND,
    kind: "launch",
    goal: "Introduce the product to solo SaaS founders",
    updateDetails: "EaseYourStartup turns a website and product update into launch material.",
    audience: "Solo SaaS founders",
    launchDate: "2026-10-01",
    cta: "Build your launch campaign",
    angle: DEMO_ANGLES[0],
    channels,
  };
}

function strategyFor(input: GenerateCampaignInput) {
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
      positioning: "Turn each product update into a focused launch plan.",
      audienceInsight: "Founders need a clear way to share what they shipped.",
      narrativeArc: {
        opening: "Shipping a change starts the release story.",
        development: "Give the update a focused explanation for each channel.",
        close: "Offer one direct next step.",
      },
      keyMessages: [
        "Keep the product update concrete.",
        "Match the story to the place it appears.",
      ],
      channelApproaches: input.channels.map((channel) => ({
        channel,
        rationale: `Make the announcement useful to ${channel} readers.`,
        structure: "Lead with the update, give context, then the user CTA.",
      })),
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
      supportingClaimIds: ["claim-campaign"],
    },
  });
}

function requestDataFrom(callIndex: number) {
  const messages = aiMock.mock.calls[callIndex][0].messages as Array<{
    role: string;
    content: string;
  }>;
  const text = messages.find((message) => message.role === "user")?.content ?? "";
  const json = text.match(/REQUEST_DATA_START\n([\s\S]*)\nREQUEST_DATA_END/)?.[1];
  if (!json) throw new Error("Missing structured request data in test mock.");
  return JSON.parse(json) as Record<string, unknown>;
}

function copyResponse(
  channel: Channel,
  cta: string,
  primaryCopy: string,
  linkedClaimIds: string[] = [],
) {
  return {
    channel,
    primaryCopy,
    alternateHooks: [],
    cta,
    hashtags: [],
    linkedClaimIds,
    warnings: [],
  };
}

const mockMetadata = {
  task: "copyModel" as const,
  provider: "openai" as const,
  model: "test-model",
  promptVersion: "test-v1",
  latencyMs: 0,
  success: true,
};

describe("Generation V2 platform content", () => {
  beforeEach(() => aiMock.mockReset());

  it("keeps app-owned fields out of the model response schema", () => {
    const schema = platformCopyResponseSchema();
    const valid = {
      primaryCopy: "A focused product update.",
      alternateHooks: [],
      hashtags: [],
      linkedClaimIds: [],
    };
    expect(schema.safeParse(valid).success).toBe(true);
    expect(
      schema.parse({ ...valid, channel: "x", cta: "Wrong CTA", warnings: [] }),
    ).toEqual(valid);
  });

  it("writes every supported channel with distinct platform instructions", async () => {
    const input = inputWithChannels();
    for (const channel of CHANNELS) {
      aiMock.mockResolvedValueOnce({
        value: copyResponse(channel, input.cta, `Native ${channel} copy.`, ["claim-campaign"]),
        metadata: mockMetadata,
      });
    }

    const outputs = await generatePlatformContent(input, strategyFor(input));
    const systemPrompts = aiMock.mock.calls.map(([request]) => request.messages[0].content);

    expect(outputs.map((output) => output.channel)).toEqual(CHANNELS);
    expect(outputs.every((output) => output.cta === input.cta)).toBe(true);
    expect(outputs.every((output) => output.linkedClaimIds[0] === "claim-campaign")).toBe(true);
    expect(outputs.every((output) => output.associatedCreativeIds.length === 0)).toBe(true);
    expect(systemPrompts).toHaveLength(CHANNELS.length);
    expect(new Set(systemPrompts).size).toBe(CHANNELS.length);
    expect(systemPrompts[0]).toContain("PRODUCT HUNT");
    expect(systemPrompts[1]).toContain("LINKEDIN");
    expect(systemPrompts[2]).toContain("X:");
    expect(systemPrompts[3]).toContain("REDDIT");
    expect(systemPrompts[4]).toContain("HACKER NEWS");
    expect(systemPrompts[5]).toContain("INSTAGRAM");
    expect(systemPrompts[6]).toContain("THREADS");
    expect(systemPrompts[7]).toContain("FACEBOOK");
    expect(systemPrompts[8]).toContain("LAUNCH EMAIL");
  });

  it("limits concurrent channel drafts to two and preserves requested order", async () => {
    const channels: Channel[] = ["product_hunt", "linkedin", "threads"];
    const input = inputWithChannels(channels);
    let active = 0;
    let maxActive = 0;
    let callIndex = 0;
    aiMock.mockImplementation(async () => {
      const channel = channels[callIndex++ % channels.length];
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, channel === "product_hunt" ? 20 : 2));
      active -= 1;
      return {
        value: copyResponse(channel, input.cta, `Native ${channel} copy.`),
        metadata: mockMetadata,
      };
    });

    const outputs = await generatePlatformContent(input, strategyFor(input));

    expect(callIndex).toBe(channels.length);
    expect(maxActive).toBe(2);
    expect(outputs.map((output) => output.channel)).toEqual(channels);
  });

  it("fills channel, exact CTA, and warnings outside the model response", async () => {
    const input = inputWithChannels(["threads"]);
    aiMock.mockResolvedValueOnce({
      value: {
        channel: "x",
        primaryCopy: "A short, grounded Threads update.",
        alternateHooks: [],
        cta: "Wrong CTA",
        hashtags: [],
        linkedClaimIds: [],
      },
      metadata: mockMetadata,
    });

    const [output] = await generatePlatformContent(input, strategyFor(input));

    expect(output).toMatchObject({
      channel: "threads",
      cta: input.cta,
      warnings: [],
      associatedCreativeIds: [],
    });
  });

  it("rejects linked claim IDs that are not in approved campaign evidence", async () => {
    const input = inputWithChannels(["reddit"]);
    aiMock.mockResolvedValueOnce({
      value: copyResponse("reddit", input.cta, "An update for the community.", ["pending-claim"]),
      metadata: mockMetadata,
    });

    await expect(generatePlatformContent(input, strategyFor(input))).rejects.toThrow(
      /outside approved campaign evidence: pending-claim/i,
    );
  });

  it("uses each platform prompt during exactly one feedback rewrite pass", async () => {
    const input = inputWithChannels(["product_hunt", "x"]);
    [
      ["product_hunt", "Draft 3 for product_hunt."],
      ["x", "Draft 4 for x."],
    ].forEach(([channel, copy]) => {
      aiMock.mockResolvedValueOnce({
        value: copyResponse(channel as Channel, input.cta, copy),
        metadata: mockMetadata,
      });
    });

    const outputs = await generatePlatformContent(
      input,
      strategyFor(input),
      "Make the opening more concrete.",
      [
        channelOutputSchema.parse({
          ...copyResponse(
            "product_hunt",
            input.cta,
            "Draft 1 for product_hunt.",
          ),
          associatedCreativeIds: [],
        }),
        channelOutputSchema.parse({
          ...copyResponse("x", input.cta, "Draft 2 for x."),
          associatedCreativeIds: [],
        }),
      ],
    );

    expect(aiMock).toHaveBeenCalledTimes(2);
    expect(outputs.map((output) => output.primaryCopy)).toEqual([
      "Draft 3 for product_hunt.",
      "Draft 4 for x.",
    ]);
    for (let index = 0; index < 2; index += 1) {
      const prompt = aiMock.mock.calls[index][0].messages[0].content as string;
      const request = requestDataFrom(index);
      expect(prompt).toContain(index === 0 ? "PRODUCT HUNT" : "X:");
      expect(prompt).toContain("Remove or narrow each specifically flagged factual statement");
      expect(prompt).toContain("do not add replacement facts");
      expect(request.reviewerFeedback).toBe("Make the opening more concrete.");
      expect(request.firstDraft).toBeTruthy();
    }
  });

  it("rewrites only requested channels and preserves the reviewed order", async () => {
    const channels: Channel[] = ["linkedin", "instagram", "threads"];
    const input = inputWithChannels(channels);
    const reviewedDrafts = channels.map((channel) =>
      channelOutputSchema.parse({
        ...copyResponse(channel, input.cta, `Original ${channel} copy.`),
        associatedCreativeIds: [],
      }),
    );
    aiMock.mockResolvedValueOnce({
      value: copyResponse("linkedin", input.cta, "Revised LinkedIn copy."),
      metadata: mockMetadata,
    });

    const outputs = await generatePlatformContent(
      input,
      strategyFor(input),
      "Remove the unsupported claim from LinkedIn.",
      reviewedDrafts,
      ["linkedin"],
    );

    expect(aiMock).toHaveBeenCalledTimes(1);
    expect(outputs.map((output) => output.channel)).toEqual(channels);
    expect(outputs.map((output) => output.primaryCopy)).toEqual([
      "Revised LinkedIn copy.",
      "Original instagram copy.",
      "Original threads copy.",
    ]);
    expect(outputs[1]).toEqual(reviewedDrafts[1]);
    expect(outputs[2]).toEqual(reviewedDrafts[2]);
  });

  it("rejects a strategy whose campaign CTA or evidence changed after planning", async () => {
    const input = inputWithChannels(["linkedin"]);
    const strategy = strategyFor(input);
    const changedCTA = {
      ...strategy,
      brief: { ...strategy.brief, cta: "Try something else" },
    };
    await expect(generatePlatformContent(input, changedCTA)).rejects.toThrow(
      /does not match the requested campaign brief/i,
    );
    expect(aiMock).not.toHaveBeenCalled();
  });
});
