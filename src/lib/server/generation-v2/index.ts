import "server-only";

import {
  channelOutputSchema,
  generateCampaignSchema,
  generationResultSchema,
  type CreativeDesignResult,
  type ChannelOutput,
  type GenerateCampaignInput,
  type GenerationResult,
} from "@/lib/contracts";
import {
  createInitialCreativeCanvas,
} from "@/lib/server/campaign-generator";
import { campaignDesignPlanToCanvas } from "@/lib/generation-v2/design-canvas";
import { generateCampaignStrategy } from "./strategy";
import { generatePlatformContent } from "./content";
import {
  campaignDesignPlanToDirections,
  fallbackCampaignDesignPlan,
  planCampaignDesign,
} from "./design-plan";
import {
  assertApprovedClaimLinks,
  needsCraftRewrite,
  reviewCampaignGeneration,
  type CampaignGenerationReview,
} from "./critic";

const MAX_REWRITE_FEEDBACK_LENGTH = 2000;
const FINDINGS_HEADER =
  "Unsupported factual findings to remove or narrow (exact statement and reason):\n";
const REVIEWER_FEEDBACK_HEADER = "\nReviewer feedback:\n";
const OMITTED_FINDINGS_NOTE =
  "\n[Additional unsupported findings omitted to fit the rewrite limit.]";

function buildRewriteFeedback(review: CampaignGenerationReview): string {
  const reviewerFeedback = review.feedback
    .filter((item) => item.trim().length > 0)
    .join("\n");
  const feedbackText =
    reviewerFeedback ||
    "Remove or narrow each flagged factual statement and improve the campaign using the review findings.";
  const findingLines = review.unsupportedStatements.map((finding) =>
    `- ${JSON.stringify({
      channel: finding.channel,
      statement: finding.statement,
      reason: finding.reason,
      ...(finding.linkedClaimId ? { linkedClaimId: finding.linkedClaimId } : {}),
    })}`,
  );
  const findingsHeader = findingLines.length > 0 ? FINDINGS_HEADER : "";
  const minimumFeedbackLength = Math.min(400, feedbackText.length);
  const includedFindings: string[] = [];

  for (const [index, line] of findingLines.entries()) {
    const candidateFindings = [...includedFindings, line].join("\n");
    const hasMoreFindings = index < findingLines.length - 1;
    const omissionLength = hasMoreFindings ? OMITTED_FINDINGS_NOTE.length : 0;
    const totalLength =
      findingsHeader.length +
      candidateFindings.length +
      omissionLength +
      REVIEWER_FEEDBACK_HEADER.length +
      minimumFeedbackLength;
    if (totalLength > MAX_REWRITE_FEEDBACK_LENGTH) break;
    includedFindings.push(line);
  }

  const omittedFindings = includedFindings.length < findingLines.length;
  const findingsText =
    findingsHeader +
    includedFindings.join("\n") +
    (omittedFindings ? OMITTED_FINDINGS_NOTE : "");
  const reviewerFeedbackRoom =
    MAX_REWRITE_FEEDBACK_LENGTH -
    findingsText.length -
    REVIEWER_FEEDBACK_HEADER.length;

  return `${findingsText}${REVIEWER_FEEDBACK_HEADER}${feedbackText.slice(0, reviewerFeedbackRoom)}`;
}

function removeUnsupportedSentences(
  input: GenerateCampaignInput,
  outputs: ChannelOutput[],
  findings: CampaignGenerationReview["unsupportedStatements"],
) {
  return outputs.map((output) => {
    const channelFindings = findings.filter(
      (finding) => finding.channel === null || finding.channel === output.channel,
    );
    if (channelFindings.length === 0) return output;

    const primaryCopy = output.primaryCopy
      .split(/(?<=[.!?])\s+|\r?\n+/)
      .filter((sentence) =>
        !channelFindings.some((finding) =>
          sentence.includes(finding.statement.trim()),
        ),
      )
      .join("\n\n")
      .trim();
    // Optional hooks may repeat the same unsupported promise in different words.
    // Keep the usable post; discard those alternatives during safety recovery.
    const alternateHooks: string[] = [];
    if (
      primaryCopy === output.primaryCopy &&
      alternateHooks.length === output.alternateHooks.length
    ) {
      return output;
    }

    return channelOutputSchema.parse({
      ...output,
      primaryCopy: primaryCopy || input.cta,
      alternateHooks,
      linkedClaimIds: [],
    });
  });
}

export async function generateCampaignV2(
  input: GenerateCampaignInput,
  options: {
    includeCreativeDesign?: boolean;
    onDesignStart?: () => Promise<void> | void;
  } = {},
): Promise<GenerationResult> {
  const brief = generateCampaignSchema.parse(input);
  const strategy = await generateCampaignStrategy(brief);

  let outputs = await generatePlatformContent(brief, strategy);
  await options.onDesignStart?.();
  let designPlan = await planCampaignDesign(brief, strategy, outputs);
  let review = await reviewCampaignGeneration({
    input: brief,
    strategy,
    outputs,
    designPlan,
  });

  if (review.needsRewrite) {
    const rewriteChannels =
      review.unsupportedStatements.length > 0 &&
      !needsCraftRewrite(review.scores) &&
      review.unsupportedStatements.every((finding) => finding.channel !== null)
        ? [...new Set(review.unsupportedStatements.map((finding) => finding.channel!))]
        : undefined;
    outputs = await generatePlatformContent(
      brief,
      strategy,
      buildRewriteFeedback(review),
      outputs,
      rewriteChannels,
    );
    designPlan = await planCampaignDesign(brief, strategy, outputs);
    review = await reviewCampaignGeneration({
      input: brief,
      strategy,
      outputs,
      designPlan,
    });
  }

  if (review.unsupportedStatements.length > 0) {
    outputs = removeUnsupportedSentences(
      brief,
      outputs,
      review.unsupportedStatements,
    );
    designPlan = fallbackCampaignDesignPlan(brief, strategy, outputs);
    review = await reviewCampaignGeneration({
      input: brief,
      strategy,
      outputs,
      designPlan,
    });
  }

  assertApprovedClaimLinks({ input: brief, strategy, outputs, designPlan });
  if (review.unsupportedStatements.length > 0) {
    throw new Error(
      "Campaign review found unsupported factual statements after the allowed rewrite. Your campaign was not saved.",
    );
  }
  if (review.needsRewrite) {
    throw new Error(
      "Campaign quality remained below the review threshold after one rewrite. Your campaign was not saved.",
    );
  }

  let creativeDesign: CreativeDesignResult | undefined;
  if (options.includeCreativeDesign !== false) {
    const firstComponent = designPlan.components[0];
    if (!firstComponent) throw new Error("Campaign generation did not produce launch copy for its canvas.");
    const canvas = createInitialCreativeCanvas(brief, firstComponent.headline);
    creativeDesign = campaignDesignPlanToCanvas(designPlan, canvas, brief.brand);
  }

  return generationResultSchema.parse({
    angles: [brief.angle],
    outputs,
    creativeDirections: campaignDesignPlanToDirections(designPlan),
    ...(creativeDesign ? { creativeDesign } : {}),
    mode: "ai",
    generationVersion: "v2",
    generationV2: { strategy, designPlan, review },
  });
}
