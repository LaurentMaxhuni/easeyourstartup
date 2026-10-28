import type { BrandProfile, CampaignKind, StudioDraft } from "@/lib/contracts";
import { campaignBrandKit, CAMPAIGN_DESIGN_SIZE, shortBrandName } from "./campaign-seed";
import { designDocumentSchema, type DesignAsset, type DesignDocument } from "./document";
import { availableTemplates, buildTemplatePage, contrastRatio } from "./templates";

export type CampaignTemplateConcept = {
  id: string;
  label: string;
  message: string;
  description: string;
  document: DesignDocument;
};

const KICKERS: Record<CampaignKind, string> = {
  launch: "Introducing", feature_update: "What's new", milestone: "A new milestone",
  waitlist: "Join the waitlist", promotion: "Special offer", custom: "From the team",
};
const FAMILIES: Record<string, string> = {
  "swiss-grid": "grid", "tech-grid": "grid", "editorial-serif": "editorial",
  "dark-aurora": "spotlight", spotlight: "spotlight", "big-type": "type",
  "outline-echo": "type", brutalist: "frame", "split-field": "graphic",
  "product-hero": "product", "quiet-minimal": "minimal",
};

function excerpt(text: string, limit: number) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${(boundary > limit / 2 ? slice.slice(0, boundary) : slice).trimEnd()}…`;
}

/** No network or model calls: three compositions filled with approved wording. */
export function campaignTemplateConcepts({ brand, draft, assets = [] }: {
  brand: BrandProfile;
  draft: StudioDraft;
  assets?: DesignAsset[];
}): CampaignTemplateConcept[] {
  const kit = campaignBrandKit(brand);
  const images = assets.filter((asset) => asset.kind === "image").slice(0, 12);
  const message = draft.updateDetails.trim();
  const firstSentence = message.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? message;
  const copy = {
    kicker: KICKERS[draft.kind],
    headline: excerpt(firstSentence || brand.tagline || shortBrandName(brand.projectName), 110),
    body: excerpt(message.slice(firstSentence.length).trim(), 220),
    cta: excerpt(draft.cta.trim() || brand.cta, 48),
  };
  // Match known scan signals; do not put a new semantic provider on the preview path.
  const character = [...brand.voice, brand.audience, ...brand.fonts,
    ...(brand.brandIntelligence?.tone ?? []), ...(brand.brandIntelligence?.visualStyle ?? [])].join(" ");
  const scores: Record<string, number> = {};
  const boost = (id: string, score: number) => { scores[id] = (scores[id] ?? 0) + score; };
  if (draft.kind === "feature_update") boost("swiss-grid", 5);
  if (draft.kind === "launch" || draft.kind === "waitlist") boost("spotlight", 5);
  if (draft.kind === "promotion") boost("split-field", 6);
  if (draft.kind === "milestone") boost("big-type", 5);
  if (/\b(technical|engineered|developer|developers|api|infrastructure)\b/i.test(character)) {
    boost("tech-grid", 8); boost("brutalist", 4);
  }
  if (/\b(premium|restrained|calm|luxury|minimal|airy)\b/i.test(character) || brand.visualSystem?.density === "airy") {
    boost("quiet-minimal", 8); boost("editorial-serif", 5);
  }
  if (/\b(playful|bold|energetic|expressive|fun)\b/i.test(character)) {
    boost("big-type", 8); boost("outline-echo", 5); boost("split-field", 3);
  }
  if (/serif|fraunces|playfair|baskerville|cormorant/i.test(character)) boost("editorial-serif", 4);
  if (kit.background !== "transparent" && contrastRatio(kit.background, "#ffffff") > contrastRatio(kit.background, "#000000")) boost("dark-aurora", 4);
  if (brand.visualSystem?.usesGradient) boost("dark-aurora", 4);
  if (images.length) boost("product-hero", 14);

  const ranked = availableTemplates(images).map((template, index) => ({
    template, index,
    score: (scores[template.id] ?? 0) - Math.max(0, copy.headline.length - template.headlineMaxChars) / 12,
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  const families = new Set<string>();
  const selected = ranked.filter(({ template }) => {
    const family = FAMILIES[template.id] ?? template.id;
    if (families.has(family)) return false;
    families.add(family);
    return true;
  }).slice(0, 3);

  return selected.map(({ template }) => ({
    id: template.id,
    label: template.name,
    message: message || copy.headline,
    description: template.mood,
    document: designDocumentSchema.parse({
      version: 1,
      title: `${shortBrandName(brand.projectName)} · ${template.name}`.slice(0, 180),
      brand: kit,
      assets: images,
      pages: [buildTemplatePage(template, {
        ...CAMPAIGN_DESIGN_SIZE, brand: kit, assets: images, copy, slideIndex: 0, slideCount: 1,
      }, "page-1", template.name)],
    }),
  }));
}
