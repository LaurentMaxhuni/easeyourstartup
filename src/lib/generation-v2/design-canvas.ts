import {
  creativeDesignResultSchema,
  type BrandProfile,
  type CreativeComposition,
  type CreativeElement,
  type CreativeTextRole,
} from "@/lib/contracts";
import { campaignDesignPlanSchema, type CampaignDesignPlan } from "./design-schema";
import { OUTFIT_FONT_FAMILY } from "@/lib/typography";
import { toExportableImageUrl } from "@/lib/studio-export";

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
  const zones: Record<CreativeTextRole, [number, number, number]> = {
    eyebrow: [7, 5, 1.7],
    headline: [17, image ? 18 : 24, 6.2],
    subheadline: [image ? 37 : 44, image ? 10 : 16, 2.6],
    body: [image ? 49 : 64, image ? 10 : 12, 1.8],
    cta: [84, 6, 2],
    footer: [93, 3, 1.2],
  };
  const elements: CreativeElement[] = [{
    id: "brand-rule", kind: "shape", shape: "line", x: 8, y: 5, width: 12, height: 0.5,
    fill: readableColor(theme.background, theme.accent), rotation: 0, opacity: 1, locked: false, hidden: false,
  }];
  if (image) elements.push({
    id: "product-screenshot", kind: "image", src: image, alt: screenshot?.alt ?? "Product screenshot",
    x: 8, y: 61, width: 84, height: 20, imageFit: "contain", radius: 8,
    rotation: 0, opacity: 1, locked: false, hidden: false,
  });
  for (const role of Object.keys(text) as CreativeTextRole[]) {
    if (!text[role].trim()) continue;
    const [y, height, preferredSize] = zones[role];
    // Conservative word wrapping at export size; never truncate reviewed wording.
    let fontSize = preferredSize;
    while (fontSize > 0.8) {
      const capacity = 80 / (fontSize * 0.64);
      let lines = 1;
      let used = 0;
      for (const word of text[role].split(/\s+/)) {
        if (used && used + word.length + 1 > capacity) { lines += 1; used = 0; }
        lines += Math.max(0, Math.ceil(word.length / capacity) - 1);
        used += word.length + (used ? 1 : 0);
      }
      if (lines * fontSize * 1.25 <= height * composition.output.height / composition.output.width * 0.85) break;
      fontSize = Math.round((fontSize - 0.1) * 10) / 10;
    }
    elements.push({
      id: `text-${role}`, kind: "text", textRole: role, text: text[role],
      x: 8, y, width: 84, height, fontSize, fontFamily: OUTFIT_FONT_FAMILY,
      fontWeight: role === "headline" ? 650 : role === "cta" ? 600 : 450,
      lineHeight: 1.25, align: component.alignment,
      color: role === "cta" ? readableColor(theme.accent, theme.background) : foreground,
      ...(role === "cta" ? { fill: theme.accent, radius: 8 } : {}),
      rotation: 0, opacity: 1, locked: false, hidden: false,
    });
  }
  return creativeDesignResultSchema.parse({ theme: { ...theme, foreground }, elements });
}
