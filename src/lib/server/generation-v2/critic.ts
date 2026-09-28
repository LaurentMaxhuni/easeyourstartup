import "server-only";

import { z } from "zod";
import {
  channelSchema,
  type Channel,
  type ChannelOutput,
  type GenerateCampaignInput,
} from "@/lib/contracts";
import {
  OpenRouterFreeModelQuotaError,
  requestStructuredAiJson,
} from "@/lib/server/campaign-generator";
import type { CampaignDesignPlan } from "@/lib/generation-v2/design-schema";
import type { CampaignStrategy } from "./strategy-schema";

const reviewScoreSchema = z.number().int().min(0).max(100);

export const campaignGenerationScoresSchema = z.object({
  specificity: reviewScoreSchema,
  factualAccuracy: reviewScoreSchema,
  brandFit: reviewScoreSchema,
  hookQuality: reviewScoreSchema,
  clarity: reviewScoreSchema,
  platformFit: reviewScoreSchema,
  genericLanguage: reviewScoreSchema,
  visualContentConsistency: reviewScoreSchema,
});

export const unsupportedStatementSchema = z.object({
  channel: channelSchema.nullable(),
  statement: z.string().min(1).max(300),
  reason: z.string().min(1).max(400),
  linkedClaimId: z.string().max(160).optional(),
});

const campaignGenerationAssessmentSchema = z.object({
  scores: campaignGenerationScoresSchema,
  feedback: z.array(z.string().min(1).max(400)).max(12),
  unsupportedStatements: z.array(unsupportedStatementSchema).max(30),
});

export const campaignGenerationReviewSchema = campaignGenerationAssessmentSchema.extend({
  needsRewrite: z.boolean(),
});

export type CampaignGenerationReview = z.infer<
  typeof campaignGenerationReviewSchema
>;

export type CampaignGenerationReviewInput = {
  input: GenerateCampaignInput;
  strategy: CampaignStrategy;
  outputs: ChannelOutput[];
  designPlan: CampaignDesignPlan;
};

export type UnsupportedClaimLink = {
  location:
    | "strategy.approvedClaims"
    | "strategy.supportingClaimIds"
    | "designPlan.component"
    | "output";
  channel?: Channel;
  componentId?: string;
  claimId: string;
  issue: "unapproved_claim_id" | "changed_evidence";
};

/**
 * Advisory score cutoffs. Rewrite if the average is below 70, factual accuracy
 * is below 80, any craft score is below 55, or the reviewer flags a claim.
 * Invalid claim links are independently deterministic and always require a rewrite.
 */
export const CAMPAIGN_REWRITE_THRESHOLDS = {
  average: 70,
  factualAccuracy: 80,
  individualCraftScore: 55,
} as const;

function approvedClaims(input: GenerateCampaignInput) {
  const counts = new Map<string, number>();
  for (const claim of input.brand.claims) {
    counts.set(claim.id, (counts.get(claim.id) ?? 0) + 1);
  }

  return new Map(
    input.brand.claims
      .filter(
        (claim) =>
          claim.approvalState === "approved" && counts.get(claim.id) === 1,
      )
      .map((claim) => [claim.id, claim]),
  );
}

export function findUnsupportedClaimLinks({
  input,
  strategy,
  outputs,
  designPlan,
}: CampaignGenerationReviewInput) {
  const approved = approvedClaims(input);
  const violations: UnsupportedClaimLink[] = [];

  for (const claim of strategy.evidence.approvedClaims) {
    const source = approved.get(claim.id);
    if (!source) {
      violations.push({
        location: "strategy.approvedClaims",
        claimId: claim.id,
        issue: "unapproved_claim_id",
      });
    } else if (
      source.text !== claim.text ||
      source.sourceUrl !== claim.sourceUrl ||
      source.sourceExcerpt !== claim.sourceExcerpt ||
      source.confidence !== claim.confidence
    ) {
      violations.push({
        location: "strategy.approvedClaims",
        claimId: claim.id,
        issue: "changed_evidence",
      });
    }
  }

  for (const claimId of strategy.evidence.supportingClaimIds) {
    if (!approved.has(claimId)) {
      violations.push({
        location: "strategy.supportingClaimIds",
        claimId,
        issue: "unapproved_claim_id",
      });
    }
  }

  for (const component of designPlan.components) {
    for (const claimId of component.supportingClaimIds) {
      if (!approved.has(claimId)) {
        violations.push({
          location: "designPlan.component",
          componentId: component.id,
          claimId,
          issue: "unapproved_claim_id",
        });
      }
    }
  }

  for (const output of outputs) {
    for (const claimId of output.linkedClaimIds) {
      if (!approved.has(claimId)) {
        violations.push({
          location: "output",
          channel: output.channel,
          claimId,
          issue: "unapproved_claim_id",
        });
      }
    }
  }

  return violations;
}

export class UnsupportedGenerationClaimError extends Error {
  readonly violations: UnsupportedClaimLink[];

  constructor(violations: UnsupportedClaimLink[]) {
    super(
      `Generation references ${violations.length} claim link(s) that are not exact approved evidence.`,
    );
    this.name = "UnsupportedGenerationClaimError";
    this.violations = violations;
  }
}

/** Call after the optional rewrite. Throws if any claim link is not exact approved evidence. */
export function assertApprovedClaimLinks({
  input,
  strategy,
  outputs,
  designPlan,
}: CampaignGenerationReviewInput) {
  const violations = findUnsupportedClaimLinks({
    input,
    strategy,
    outputs,
    designPlan,
  });
  if (violations.length > 0) {
    throw new UnsupportedGenerationClaimError(violations);
  }
}

function bounded(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function linkedClaimWarnings(violations: UnsupportedClaimLink[]) {
  return violations.map((violation) => ({
    channel: violation.channel ?? null,
    statement: `Unapproved claim reference at ${violation.location}.`,
    reason:
      violation.issue === "changed_evidence"
        ? "Strategy evidence text or source fields differ from the exact approved claim."
        : "Claim ID is absent from the uniquely identified approved claims in the input profile.",
    ...(violation.claimId.length <= 160
      ? { linkedClaimId: violation.claimId }
      : {}),
  }));
}

function buildCriticPayload({ input, strategy, outputs, designPlan }: CampaignGenerationReviewInput) {
  const approved = [...approvedClaims(input).values()].map((claim) => ({
    id: claim.id,
    text: claim.text,
    sourceUrl: claim.sourceUrl,
    sourceExcerpt: claim.sourceExcerpt,
  }));

  return {
    brandContext: {
      name: input.brand.projectName,
      tagline: bounded(input.brand.tagline, 240),
      voice: input.brand.voice,
      audience: bounded(input.audience, 400),
      brandGuidance: input.brand.brandIntelligence
        ? {
            tone: input.brand.brandIntelligence.tone,
            visualStyle: input.brand.brandIntelligence.visualStyle,
            audience: input.brand.brandIntelligence.audience,
          }
        : undefined,
      note: "Context and brand guidance help judge fit; they are not factual evidence.",
    },
    allowedFacts: {
      approvedClaims: approved,
      userSuppliedUpdate: bounded(input.updateDetails, 2000),
      userSuppliedCta: bounded(input.cta, 240),
      rule: "Treat only these approved claims and exact user-supplied update/CTA as factual support. Do not treat goals, audience, strategy, generated copy, design copy, tagline, or brand guidance as facts.",
    },
    strategy: {
      positioning: bounded(strategy.inferred.positioning, 500),
      audienceInsight: bounded(strategy.inferred.audienceInsight, 500),
      narrativeArc: {
        opening: bounded(strategy.inferred.narrativeArc.opening, 500),
        development: bounded(strategy.inferred.narrativeArc.development, 500),
        close: bounded(strategy.inferred.narrativeArc.close, 500),
      },
      keyMessages: strategy.inferred.keyMessages.map((item) => bounded(item, 280)),
      channelApproaches: strategy.inferred.channelApproaches.map((item) => ({
        channel: item.channel,
        rationale: bounded(item.rationale, 300),
        structure: bounded(item.structure, 300),
      })),
    },
    outputs: outputs.map((output) => ({
      channel: output.channel,
      primaryCopy: bounded(output.primaryCopy, 2400),
      alternateHooks: output.alternateHooks.map((hook) => bounded(hook, 240)),
      cta: bounded(output.cta, 240),
      linkedClaimIds: output.linkedClaimIds,
    })),
    designPlan: {
      brandAdaptation: {
        tone: designPlan.brandAdaptation.tone,
        rationale: bounded(designPlan.brandAdaptation.rationale, 240),
        theme: designPlan.brandAdaptation.theme,
      },
      components: designPlan.components.map((component) => ({
        kind: component.kind,
        layout: component.layoutVariant,
        headline: bounded(component.headline, 180),
        supportingCopy: bounded(component.supportingCopy, 320),
        body: bounded(component.body, 520),
        cta: bounded(component.cta, 80),
        supportingClaimIds: component.supportingClaimIds,
        screenshotRef: component.screenshotRef,
      })),
    },
  };
}

function averageScore(scores: CampaignGenerationReview["scores"]) {
  const values = Object.values(scores);
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

function needsRewrite(
  assessment: z.infer<typeof campaignGenerationAssessmentSchema>,
  deterministicWarnings: UnsupportedClaimLink[],
) {
  const { scores, unsupportedStatements } = assessment;
  const craftScores = [
    scores.specificity,
    scores.brandFit,
    scores.hookQuality,
    scores.clarity,
    scores.platformFit,
    scores.genericLanguage,
    scores.visualContentConsistency,
  ];

  return (
    deterministicWarnings.length > 0 ||
    unsupportedStatements.length > 0 ||
    averageScore(scores) < CAMPAIGN_REWRITE_THRESHOLDS.average ||
    scores.factualAccuracy < CAMPAIGN_REWRITE_THRESHOLDS.factualAccuracy ||
    craftScores.some(
      (score) => score < CAMPAIGN_REWRITE_THRESHOLDS.individualCraftScore,
    )
  );
}

export async function reviewCampaignGeneration({
  input,
  strategy,
  outputs,
  designPlan,
}: CampaignGenerationReviewInput): Promise<CampaignGenerationReview> {
  const deterministicWarnings = findUnsupportedClaimLinks({
    input,
    strategy,
    outputs,
    designPlan,
  });
  let assessment: z.infer<typeof campaignGenerationAssessmentSchema>;

  try {
    const result = await requestStructuredAiJson({
      task: "criticModel",
      messages: [
        {
          role: "system",
          content:
            "Review the generated campaign as an editor. Score specificity, factual accuracy, brand fit, hook quality, clarity, platform fit, generic-language avoidance, and visual/content consistency from 0 to 100, where higher is better. Use only the listed allowed facts to judge factual support. Treat brand, audience, strategy, generated copy, and design plan as context or material to review, never as factual evidence. Report an unsupported statement only when it is an explicit, checkable factual assertion about the product, company, customers, market, or results that is not supported by an allowed fact. Do not flag aspirations, goals, subjective positioning, metaphors, or faithful paraphrases of an allowed fact. For each finding, quote the exact unsupported wording from the campaign and explain what evidence is missing. Suggest concise fixes in feedback. Do not rewrite campaign copy. Return only the requested structured assessment.",
        },
        {
          role: "user",
          content: JSON.stringify(buildCriticPayload({ input, strategy, outputs, designPlan })),
        },
      ],
      schema: campaignGenerationAssessmentSchema,
      schemaName: "campaign_generation_critic_assessment",
      promptVersion: "generation-v2-critic-v2",
      maxCompletionTokens: 1400,
    });
    assessment = result.value;
  } catch (error) {
    if (error instanceof OpenRouterFreeModelQuotaError) throw error;
    if (deterministicWarnings.length > 0) {
      throw new UnsupportedGenerationClaimError(deterministicWarnings);
    }
    throw new Error(
      "Campaign quality review is unavailable. Your campaign was not saved; retry when AI review is available.",
      { cause: error },
    );
  }

  const unsupportedStatements = [
    ...assessment.unsupportedStatements,
    ...linkedClaimWarnings(deterministicWarnings),
  ].slice(0, 30);
  const feedback = [...assessment.feedback];
  if (deterministicWarnings.length > 0) {
    feedback.unshift(
      "One or more generated claim links are not exact approved evidence; rewrite and validate before use.",
    );
  }

  return campaignGenerationReviewSchema.parse({
    scores: assessment.scores,
    feedback: feedback.slice(0, 12),
    unsupportedStatements,
    needsRewrite: needsRewrite(assessment, deterministicWarnings),
  });
}
