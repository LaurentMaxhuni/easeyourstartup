import { z } from "zod";
import {
  campaignKindSchema,
  channelSchema,
  narrativeAngleSchema,
} from "@/lib/contracts";

const strategyBriefSchema = z.object({
  brandName: z.string().min(1).max(120),
  brandTagline: z.string().max(240),
  brandVoice: z.array(z.string().min(1).max(48)).max(6),
  kind: campaignKindSchema,
  goal: z.string().min(8).max(500),
  updateDetails: z.string().min(8).max(2000),
  audience: z.string().min(2).max(400),
  launchDate: z.string().max(64),
  cta: z.string().min(1).max(240),
  angle: narrativeAngleSchema,
  channels: z.array(channelSchema).min(1).max(9),
});

export const campaignStrategyInferenceSchema = z.object({
  positioning: z.string().min(1).max(500),
  audienceInsight: z.string().min(1).max(500),
  narrativeArc: z.object({
    opening: z.string().min(1).max(500),
    development: z.string().min(1).max(500),
    close: z.string().min(1).max(500),
  }),
  keyMessages: z.array(z.string().min(1).max(280)).min(2).max(5),
  channelApproaches: z.array(
    z.object({
      channel: channelSchema,
      rationale: z.string().min(1).max(400),
      structure: z.string().min(1).max(400),
    }),
  ).min(1).max(9),
});

export const approvedClaimEvidenceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(400),
  sourceUrl: z.url(),
  sourceExcerpt: z.string().min(1).max(1200),
  confidence: z.number().min(0).max(1),
});

export const campaignStrategySchema = z.object({
  brief: strategyBriefSchema,
  inferred: campaignStrategyInferenceSchema,
  evidence: z.object({
    approvedClaims: z.array(approvedClaimEvidenceSchema).max(30),
    supportingClaimIds: z.array(z.string().min(1)).max(30),
  }),
}).superRefine((strategy, context) => {
  const approvedIds = new Set(strategy.evidence.approvedClaims.map((claim) => claim.id));
  for (const [index, claimId] of strategy.evidence.supportingClaimIds.entries()) {
    if (!approvedIds.has(claimId)) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "supportingClaimIds", index],
        message: "Supporting claim IDs must refer to exact approved evidence.",
      });
    }
  }

  const expectedChannels = strategy.brief.channels;
  const actualChannels = strategy.inferred.channelApproaches.map(({ channel }) => channel);
  if (
    actualChannels.length !== expectedChannels.length ||
    actualChannels.some((channel, index) => channel !== expectedChannels[index])
  ) {
    context.addIssue({
      code: "custom",
      path: ["inferred", "channelApproaches"],
      message: "Strategy must contain one approach for each requested channel, in request order.",
    });
  }
});

export type CampaignStrategy = z.infer<typeof campaignStrategySchema>;
export type ApprovedClaimEvidence = z.infer<typeof approvedClaimEvidenceSchema>;
export type CampaignStrategyInference = z.infer<
  typeof campaignStrategyInferenceSchema
>;

export type CampaignStrategyModelResult = CampaignStrategyInference & {
  supportingClaimIds: string[];
};

export const campaignStrategyModelResultSchema = campaignStrategyInferenceSchema
  .extend({ supportingClaimIds: z.array(z.string().min(1)).max(30) });

export function strategyBriefFromInput(input: import("@/lib/contracts").GenerateCampaignInput) {
  return {
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
  };
}
