import type { CreativeDesignResult } from "@/lib/contracts";

/** Only a provider-authored canvas is a generated design. Copy plans are not layouts. */
export function resolveGeneratedCreativeDesign(
  generation: { creativeDesign?: CreativeDesignResult; generationV2?: { designPlan: unknown } },
) {
  return generation.creativeDesign ?? null;
}
