import {
  creativeDesignResultSchema,
  type BrandProfile,
  type CreativeComposition,
  type CreativeDesignResult,
  type CreativeElement,
} from "@/lib/contracts";
import { campaignDesignPlanSchema, type CampaignDesignPlan } from "./design-schema";
import { OUTFIT_FONT_FAMILY } from "@/lib/typography";
import { toExportableImageUrl } from "@/lib/studio-export";

export function resolveGeneratedCreativeDesign(
  generation: { creativeDesign?: CreativeDesignResult; generationV2?: { designPlan: unknown } },
  composition: CreativeComposition,
  brand: BrandProfile | null,
  componentId?: string,
) {
  if (generation.creativeDesign) return generation.creativeDesign;
  const plan = campaignDesignPlanSchema.safeParse(generation.generationV2?.designPlan);
  return plan.success && brand
    ? campaignDesignPlanToCanvas(plan.data, composition, brand, componentId)
    : null;
}

function luminance(color: string) {
  const rgb = color.match(/[a-f\d]{2}/gi)!.map((hex) => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function readableColor(background: string, preferred: string) {
  const back = luminance(background);
  const front = luminance(preferred);
  if ((Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05) >= 4.5) return preferred;
  return back > 0.179 ? "#000000" : "#ffffff";
}

function textLines(text: string, width: number, fontSize: number) {
  const capacity = width / (fontSize * 0.49);
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (used && used + word.length + 1 > capacity) { lines += 1; used = 0; }
      lines += Math.max(0, Math.ceil(word.length / capacity) - 1);
      used = (used ? used + 1 : 0) + word.length;
    }
  }
  return lines;
}

/** Keep reviewed copy intact. Code owns geometry, contrast, and image references. */
export function campaignDesignPlanToCanvas(
  value: CampaignDesignPlan,
  composition: CreativeComposition,
  brand: BrandProfile,
  componentId?: string,
) {
  const plan = campaignDesignPlanSchema.parse(value);
  const component = componentId
    ? plan.components.find((item) => item.id === componentId)
    : [...plan.components].sort((a, b) => a.order - b.order)[0];
  if (!component) throw new Error("The selected campaign visual is unavailable.");
  const theme = plan.brandAdaptation.theme;
  const foreground = readableColor(theme.background, theme.foreground);
  const screenshotIndex = component.screenshotRef
    ? Number(component.screenshotRef.split("-").at(-1)) - 1
    : -1;
  const screenshot = brand.productScreenshotCandidates?.[screenshotIndex];
  if (component.screenshotRef && !screenshot) throw new Error("The planned product screenshot is unavailable.");
  const image = screenshot ? toExportableImageUrl(screenshot.url, "") : "";
  const text = {
    eyebrow: component.eyebrow,
    headline: component.headline,
    subheadline: component.supportingCopy,
    body: component.body,
    cta: component.cta,
    footer: component.footer,
  };
  const aspect = composition.output.height / composition.output.width;
  const wide = aspect < 0.85;
  const copyWidth = wide ? 49 : 86;
  const copyRoles = (["headline", "subheadline", "body"] as const).filter((role) => text[role].trim());
  const sizes = { headline: wide ? 5.6 : 8.6, subheadline: wide ? 1.9 : 2.85, body: wide ? 1.5 : 2.15 };
  const lineHeights = { headline: 1.06, subheadline: 1.35, body: 1.4 };
  const heightFor = (role: typeof copyRoles[number], scale: number) =>
    textLines(text[role], copyWidth, sizes[role] * scale) * sizes[role] * scale * lineHeights[role] / aspect + 1.2;
  // Reserve a visual focal point. Scale dense copy as a group; omit empty roles.
  let scale = 1;
  const copyBudget = wide ? 61 : image ? 39 : 42;
  while (copyRoles.reduce((sum, role) => sum + heightFor(role, scale) + 2.4, 0) > copyBudget && scale > 0.35) scale *= 0.96;
  const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
  const elements: CreativeElement[] = [];
  const shape = (id: string, x: number, y: number, width: number, height: number, fill: string, radius = 0, opacity = 1) =>
    elements.push({ ...base, id, kind: "shape", shape: "rectangle", x, y, width, height, fill, radius, opacity });
  shape("brand-mark", 7, 6, 2.2, 2.2 / aspect, theme.accent, 4);
  const eyebrowSize = wide ? 1.25 : 1.8;
  if (text.eyebrow.trim()) elements.push({
    ...base, id: "text-eyebrow", kind: "text", textRole: "eyebrow", text: text.eyebrow,
    x: 11, y: 5.8, width: 82, height: 5,
    fontSize: Math.min(eyebrowSize, 4 * aspect / (textLines(text.eyebrow, 82, eyebrowSize) * 1.3)),
    fontFamily: OUTFIT_FONT_FAMILY, fontWeight: 600, lineHeight: 1.3, color: foreground,
  });
  let cursor = 14;
  for (const role of copyRoles) {
    const height = heightFor(role, scale);
    elements.push({
      id: `text-${role}`, kind: "text", textRole: role, text: text[role],
      x: 7, y: cursor, width: copyWidth, height, fontSize: sizes[role] * scale,
      fontFamily: OUTFIT_FONT_FAMILY, fontWeight: role === "headline" ? 750 : 450,
      lineHeight: lineHeights[role], align: component.alignment, color: foreground, ...base,
    });
    cursor += height + 2.4;
  }
  const visual = wide
    ? { x: 62, y: 15, width: 31, height: 63 }
    : { x: 7, y: Math.max(46, cursor + 1.6), width: 86, height: 0 };
  if (!wide) visual.height = 80 - visual.y;
  shape("visual-ground", visual.x, visual.y, visual.width, visual.height, foreground, 32);
  if (image) {
    elements.push({
      ...base, id: "product-screenshot", kind: "image", src: image, alt: screenshot?.alt ?? "Product screenshot",
      x: visual.x + 2, y: visual.y + 2, width: visual.width - 4, height: visual.height - 4, imageFit: "contain", radius: 20,
    });
  } else {
    // Abstract brand artwork, never a fabricated product screenshot or claim.
    const unit = Math.min(visual.width * 0.42, visual.height * aspect * 0.72);
    const tileHeight = unit / aspect;
    const tileX = visual.x + (visual.width - unit) / 2;
    const tileY = visual.y + (visual.height - tileHeight) / 2;
    shape("art-back", tileX - unit * 0.48, tileY + tileHeight * 0.14, unit, tileHeight * 0.86, theme.background, 28, 0.16);
    shape("art-side", tileX + unit * 0.5, tileY - tileHeight * 0.03, unit * 0.85, tileHeight * 0.85, theme.background, 28, 0.45);
    shape("art-main", tileX, tileY, unit, tileHeight, theme.accent, 32);
    elements.push({
      ...base, id: "art-arrow", kind: "icon", icon: "arrow-up-right",
      x: tileX + unit * 0.25, y: tileY + tileHeight * 0.25, width: unit * 0.5, height: tileHeight * 0.5,
      color: readableColor(theme.accent, foreground),
    });
    shape("art-rule", visual.x + 5, visual.y + 4, wide ? 8 : 18, 0.3, theme.background, 0, 0.35);
  }
  if (text.cta.trim()) {
    let fontSize = wide ? 1.6 : 2.3;
    const width = Math.min(wide ? 49 : 70, Math.max(25, text.cta.length * fontSize * 0.56 + 7));
    const height = wide ? 9 : 6;
    while (textLines(text.cta, width * 0.86, fontSize) * fontSize * 1.2 / aspect > height * 0.8) fontSize *= 0.95;
    elements.push({
      ...base, id: "text-cta", kind: "text", textRole: "cta", text: text.cta,
      x: 7, y: 85, width, height, fontSize, fontFamily: OUTFIT_FONT_FAMILY, fontWeight: 600,
      lineHeight: 1.2, align: "center", color: readableColor(foreground, theme.background), fill: foreground, radius: 14,
    });
  }
  if (text.footer.trim()) {
    const fontSize = wide ? 1 : 1.5;
    elements.push({
      ...base, id: "text-footer", kind: "text", textRole: "footer", text: text.footer,
      x: 7, y: 94, width: 86, height: 5, fontSize: Math.min(fontSize, 4 * aspect / (textLines(text.footer, 86, fontSize) * 1.3)),
      fontFamily: OUTFIT_FONT_FAMILY, fontWeight: 450, lineHeight: 1.3, color: foreground,
    });
  }
  return creativeDesignResultSchema.parse({ theme: { ...theme, foreground }, elements });
}
