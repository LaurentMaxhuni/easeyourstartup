import type { BrandProfile, StudioDraft } from "@/lib/contracts";

export function campaignDraftWithDefaults(draft: StudioDraft, brand: BrandProfile): StudioDraft {
  return {
    ...draft,
    goal: draft.goal.trim() || `Introduce ${brand.projectName} and invite people to learn more`.slice(0, 500),
    audience: draft.audience.trim() || brand.audience || "People interested in this product",
    cta: draft.cta.trim() || brand.cta || "Learn more",
  };
}
