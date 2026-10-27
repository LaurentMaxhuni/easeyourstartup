import type { BrandProfile, CreativeDirection } from "@/lib/contracts";
import { brandKitSchema, designDocumentSchema, DESIGN_FONTS, type BrandKit, type DesignAsset, type DesignDocument } from "./document";
import { buildTemplatePage, LAYOUT_TEMPLATES, type LayoutTemplate, type TemplateCopy } from "./templates";

// Square posts read well on every launch channel; the editor can resize them.
export const CAMPAIGN_DESIGN_SIZE = { width: 1080, height: 1080 } as const;

const SPACING = { compact: "compact", comfortable: "balanced", airy: "generous" } as const;

function catalogFont(...names: (string | undefined)[]) {
  for (const name of names) {
    const family = name?.split(",")[0]?.replace(/["']/g, "").trim().toLowerCase();
    const match = DESIGN_FONTS.find((font) => font.toLowerCase() === family);
    if (match) return match;
  }
  return "Outfit" as const;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Page titles often carry a tagline ("Name — What it does"); the brand slot
// and kicker need just the name.
export function shortBrandName(projectName: string) {
  return projectName.split(/\s+[—–|:·-]\s+|\s*\|\s*/)[0].trim().slice(0, 40) || projectName.slice(0, 40);
}

// The scanned site becomes the design's brand kit. Fonts outside the editor's
// self-hosted catalog fall back to Outfit, which lets templates pick a pairing.
export function campaignBrandKit(brand: BrandProfile): BrandKit {
  const visual = brand.visualSystem;
  const byLightness = [...brand.colors].sort((a, b) => luminance(b) - luminance(a));
  return brandKitSchema.parse({
    name: shortBrandName(brand.projectName),
    primary: visual?.accentColor ?? brand.colors[1] ?? brand.colors[0],
    secondary: visual?.foregroundColor ?? byLightness.at(-1),
    background: visual?.backgroundColor ?? byLightness[0],
    headingFont: catalogFont(visual?.headingFont, brand.fonts[0]),
    bodyFont: catalogFont(visual?.bodyFont, brand.fonts[1], brand.fonts[0]),
    personality: [...brand.voice, ...(brand.brandIntelligence?.tone ?? [])].join(", ").slice(0, 1000) || undefined,
    spacing: visual ? SPACING[visual.density] : undefined,
    formats: ["Social post · 1:1"],
  });
}

export function campaignDesignCopy(brand: BrandProfile, direction?: CreativeDirection, cta = ""): TemplateCopy {
  return {
    // The template already shows the brand name; never repeat it as the kicker.
    kicker: (direction?.eyebrow || "New").slice(0, 80),
    headline: (direction?.headline || brand.tagline || brand.projectName).slice(0, 140),
    body: (direction?.subheadline || direction?.body || "").slice(0, 280),
    cta: (direction?.cta || cta || brand.cta).slice(0, 60),
  };
}

// Carry the founder's latest edited text, rather than the initial AI suggestion,
// into campaign generation while keeping the original announcement intact.
export function conceptCampaignDetails(announcement: string, document: DesignDocument, message = ""): string {
  const text = document.pages[0]?.nodes
    .filter((node) => node.type === "text" && (node.role === "headline" || node.role === "body" || node.role === "cta"))
    .map((node) => node.text.trim()).filter(Boolean).join(" | ");
  const details = [message.trim() && `Concept angle: ${message.trim().slice(0, 300)}`, text && `Edited visual text: ${text.slice(0, 300)}`].filter(Boolean).join("\n");
  if (!details) return announcement.slice(0, 2000);
  const suffix = `\n\n${details}`;
  return announcement.slice(0, 2000 - suffix.length) + suffix;
}

export function chooseCampaignTemplate(copy: TemplateCopy, kit: BrandKit, assets: DesignAsset[]): LayoutTemplate {
  const byId = (id: string) => LAYOUT_TEMPLATES.find((template) => template.id === id)!;
  if (assets.some((asset) => asset.kind === "image")) return byId("product-hero");
  if (kit.background !== "transparent" && luminance(kit.background) < 0.2) return byId("dark-aurora");
  if (copy.headline.length <= 40) return byId("big-type");
  if (copy.headline.length <= 60) return byId("swiss-grid");
  return byId("editorial-serif");
}

// A finished first visual without a model call: a hand-designed layout filled
// with the campaign's own wording, brand colors and website screenshot.
export function campaignDesignDocument(input: {
  brand: BrandProfile;
  direction?: CreativeDirection;
  cta?: string;
  assets?: DesignAsset[];
}): DesignDocument {
  const kit = campaignBrandKit(input.brand);
  const assets = (input.assets ?? []).slice(0, 12);
  const copy = campaignDesignCopy(input.brand, input.direction, input.cta);
  const template = chooseCampaignTemplate(copy, kit, assets);
  const page = buildTemplatePage(template, { ...CAMPAIGN_DESIGN_SIZE, brand: kit, assets, copy, slideIndex: 0, slideCount: 1 }, "page-1", "Launch post");
  return designDocumentSchema.parse({
    version: 1,
    title: `${shortBrandName(input.brand.projectName)} launch visual`.slice(0, 180),
    brand: kit,
    assets,
    pages: [page],
  });
}

export function campaignDesignBrief(input: { brand: BrandProfile; goal: string; updateDetails: string; audience: string; cta: string }) {
  return [
    `A launch post for ${input.brand.projectName}.`,
    input.updateDetails && `What's new: ${input.updateDetails}`,
    input.goal && `Goal: ${input.goal}`,
    input.audience && `Audience: ${input.audience}`,
    input.cta && `Call to action: ${input.cta}`,
  ].filter(Boolean).join("\n").slice(0, 6000);
}
