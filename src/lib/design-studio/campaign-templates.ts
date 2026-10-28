import type { BrandProfile, CampaignKind, StudioDraft } from "@/lib/contracts";
import { campaignBrandKit, campaignFontSubstitutions, CAMPAIGN_DESIGN_SIZE, shortBrandName } from "./campaign-seed";
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
const GRAPHIC_TEMPLATE_IDS = ["orbit-launch", "signal-grid", "modular-collage"] as const;

function excerpt(text: string, limit: number) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${(boundary > limit / 2 ? slice.slice(0, boundary) : slice).trimEnd()}…`;
}

function sentences(text: string) {
  return (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}

function templateCopy(brand: BrandProfile, draft: StudioDraft) {
  const message = draft.updateDetails.trim();
  const parts = sentences(message);
  const firstSentence = parts[0] ?? message;
  return {
    kicker: KICKERS[draft.kind],
    headline: excerpt(firstSentence || brand.tagline || shortBrandName(brand.projectName), 110),
    body: excerpt(parts.slice(1).join(" "), 220),
    cta: excerpt(draft.cta.trim() || brand.cta, 48),
  };
}

function recommendationCopy(index: number, brand: BrandProfile, draft: StudioDraft, base: ReturnType<typeof templateCopy>) {
  const message = draft.updateDetails.trim();
  const parts = sentences(message);
  const headlineCandidates = [parts[0], parts[1], brand.tagline.trim(), shortBrandName(brand.projectName), ...parts.slice(2)]
    .filter((value): value is string => Boolean(value?.trim()));
  const distinct = [...new Set(headlineCandidates.map((value) => value.trim()))];
  const headline = distinct[index] ?? distinct[0] ?? base.headline;
  const body = index === 0
    ? parts.slice(1).join(" ")
    : index === 1
      ? parts.filter((sentence) => sentence !== headline).join(" ") || message
      : message;
  return { ...base, headline: excerpt(headline, 110), body: excerpt(body, 220) };
}

function copyForTemplate(templateId: string, brand: BrandProfile, draft: StudioDraft, base: ReturnType<typeof templateCopy>) {
  const angle = GRAPHIC_TEMPLATE_IDS.indexOf(templateId as (typeof GRAPHIC_TEMPLATE_IDS)[number]);
  return angle < 0 ? base : recommendationCopy(angle, brand, draft, base);
}

function messageForTemplate(templateId: string, brand: BrandProfile, draft: StudioDraft, copy: ReturnType<typeof templateCopy>) {
  const original = draft.updateDetails.trim();
  if (!original || original.length > 2000) return original.slice(0, 2000);
  const angle = GRAPHIC_TEMPLATE_IDS.indexOf(templateId as (typeof GRAPHIC_TEMPLATE_IDS)[number]);
  if (angle < 0 || angle === 0) return original;
  const parts = sentences(original);
  const headline = copyForTemplate(templateId, brand, draft, copy).headline;
  const headingSentence = parts.find((sentence) => excerpt(sentence, 110) === headline);
  if (headingSentence && parts.length > 1) {
    const ordered = [headingSentence, ...parts.filter((sentence) => sentence !== headingSentence)];
    const reordered = ordered.join("\n\n");
    return reordered.length <= 2000 ? reordered : original;
  }
  if (headline && !original.includes(headline)) {
    const prefixed = `${headline}\n\n${original}`;
    return prefixed.length <= 2000 ? prefixed : original;
  }
  if (parts.length > 1 && angle === 2) {
    const separated = `${parts[0]}\n\n${parts.slice(1).join(" ")}`;
    return separated.length <= 2000 ? separated : original;
  }
  return original;
}

type CampaignTemplateInput = { brand: BrandProfile; draft: StudioDraft; assets?: DesignAsset[] };
function sourceAssets(assets: DesignAsset[]) {
  return assets.filter((asset) => asset.kind !== "reference").slice(0, 12);
}

function buildConcept(template: ReturnType<typeof availableTemplates>[number], brand: BrandProfile, assets: DesignAsset[], copy: ReturnType<typeof templateCopy>, message: string, fontNotes: string[]): CampaignTemplateConcept {
  const kit = campaignBrandKit(brand);
  const description = [template.mood, fontNotes.length ? `Font substitution: ${fontNotes.join(" ")}` : ""].filter(Boolean).join(" · ");
  return {
    id: template.id,
    label: template.name,
    message,
    description,
    document: designDocumentSchema.parse({
      version: 1,
      title: `${shortBrandName(brand.projectName)} · ${template.name}`.slice(0, 180),
      brand: kit,
      assets,
      pages: [buildTemplatePage(template, {
        ...CAMPAIGN_DESIGN_SIZE, brand: kit, assets, copy, slideIndex: 0, slideCount: 1, useBrandFonts: true,
      }, "page-1", template.name)],
    }),
  };
}

/** Local, deterministic catalog of every template eligible for this brand and asset set. */
export function campaignTemplateCatalog({ brand, draft, assets = [] }: CampaignTemplateInput): CampaignTemplateConcept[] {
  const availableAssets = sourceAssets(assets);
  const baseCopy = templateCopy(brand, draft);
  const fontNotes = campaignFontSubstitutions(brand);
  return availableTemplates(availableAssets).map((template) => {
    const copy = copyForTemplate(template.id, brand, draft, baseCopy);
    return buildConcept(template, brand, availableAssets, copy, messageForTemplate(template.id, brand, draft, baseCopy), fontNotes);
  });
}

/** No network or model calls: three brand-matched graphic recommendations filled with approved wording. */
export function campaignTemplateConcepts({ brand, draft, assets = [] }: CampaignTemplateInput): CampaignTemplateConcept[] {
  const kit = campaignBrandKit(brand);
  const availableAssets = sourceAssets(assets);
  const images = availableAssets.filter((asset) => asset.kind === "image");
  const copy = templateCopy(brand, draft);
  const fontNotes = campaignFontSubstitutions(brand);
  // Match known scan signals; do not put a new semantic provider on the preview path.
  const character = [...brand.voice, brand.audience, ...brand.fonts,
    ...(brand.brandIntelligence?.tone ?? []), ...(brand.brandIntelligence?.visualStyle ?? [])].join(" ");
  const scores: Record<string, number> = Object.fromEntries(GRAPHIC_TEMPLATE_IDS.map((id) => [id, 30]));
  const boost = (id: string, score: number) => { scores[id] = (scores[id] ?? 0) + score; };
  if (draft.kind === "feature_update") boost("signal-grid", 8);
  if (draft.kind === "launch" || draft.kind === "waitlist") boost("orbit-launch", 8);
  if (draft.kind === "promotion" || draft.kind === "milestone") boost("modular-collage", 8);
  if (/\b(technical|engineered|developer|developers|api|infrastructure)\b/i.test(character)) boost("signal-grid", 12);
  if (/\b(premium|restrained|calm|luxury|minimal|airy)\b/i.test(character) || brand.visualSystem?.density === "airy") boost("orbit-launch", 12);
  if (/\b(playful|bold|energetic|expressive|fun)\b/i.test(character)) boost("modular-collage", 12);
  if (/serif|fraunces|playfair|baskerville|cormorant/i.test(character)) boost("orbit-launch", 4);
  if (kit.background !== "transparent" && contrastRatio(kit.background, "#ffffff") > contrastRatio(kit.background, "#000000")) boost("orbit-launch", 2);
  if (brand.visualSystem?.usesGradient) boost("modular-collage", 2);
  if (images.length) boost("product-hero", 50);

  const ranked = availableTemplates(availableAssets).map((template, index) => ({
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
  return selected.map(({ template }) => {
    const conceptCopy = copyForTemplate(template.id, brand, draft, copy);
    return buildConcept(template, brand, availableAssets, conceptCopy, messageForTemplate(template.id, brand, draft, copy), fontNotes);
  });
}
