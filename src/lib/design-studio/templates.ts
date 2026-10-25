import { designPageSchema, type BrandKit, type DesignAsset, type DesignNode, type DesignPage } from "./document";
import { FONT_ADVANCES } from "./font-metrics";
import { clampDesignFontWeight, designFont, type DesignFontFamily } from "./fonts";

// Hand-designed poster layouts. Each template is a function of the canvas,
// brand and slot copy, so one design adapts to portrait, square, story and
// landscape formats. Every layer stays inside the canvas; soft bleeds come
// from blur, not off-canvas geometry. Text is sized with measured glyph
// advances and greedy word wrap inside explicit height budgets; browser
// fitting in the pipeline repairs any residual overflow.
export type TemplateCopy = { kicker: string; headline: string; body: string; cta: string };
// maxHeadlineSize lets a carousel share one headline size across slides.
export type TemplateContext = { width: number; height: number; brand: BrandKit; assets: DesignAsset[]; copy: TemplateCopy; slideIndex: number; slideCount: number; maxHeadlineSize?: number };
type NodeInput = Partial<DesignNode> & Pick<DesignNode, "id" | "type" | "x" | "y" | "width" | "height">;
type Fonts = { heading: DesignFontFamily; body: DesignFontFamily };
export type LayoutTemplate = {
  id: string; name: string; mood: string; bestFor: string; headlineMaxChars: number;
  fonts: Fonts; requiresImage?: boolean;
  build: (context: TemplateContext, fonts: Fonts) => { background: string; nodes: NodeInput[] };
};

// --- Color helpers -----------------------------------------------------------
const channels = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const toHex = (values: number[]) => `#${values.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("")}`;
function luminance(hex: string) {
  return channels(hex).map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
const mix = (a: string, b: string, amount: number) => toHex(channels(a).map((value, i) => value + (channels(b)[i] - value) * amount));
const solid = (color: string, fallback: string) => color === "transparent" ? fallback : color;
const isDark = (hex: string) => luminance(hex) < 0.2;
// The most legible of the brand's own colors, then neutral ink as a fallback.
function inkOn(background: string, brand: BrandKit, minimum = 4.5) {
  const candidates = [solid(brand.secondary, "#181818"), solid(brand.background, "#f5f3ef"), "#111111", "#ffffff"];
  return candidates.find((color) => contrastRatio(color, background) >= minimum) ?? candidates.sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))[0];
}
// Rotates hue for a second aurora field that harmonizes with the primary.
function rotateHue(hex: string, degrees: number) {
  const [r, g, b] = channels(hex).map((value) => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue * 60 + degrees) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation, x = chroma * (1 - Math.abs((hue / 60) % 2 - 1)), m = lightness - chroma / 2;
  const [r1, g1, b1] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return toHex([r1 + m, g1 + m, b1 + m].map((value) => value * 255));
}

// A second glow color that stays on-brand: the brand secondary when it is a
// real hue, otherwise a neighbouring hue of the primary.
function companionHue(primary: string, brand: BrandKit) {
  const secondary = solid(brand.secondary, "#181818");
  const [r, g, b] = channels(secondary);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return chroma > 60 && !isDark(secondary) ? secondary : rotateHue(primary, -32);
}

// --- Type helpers ------------------------------------------------------------
// tracking is letter spacing in ems, so it scales with the chosen size.
type Type = { font: DesignFontFamily; weight?: number; uppercase?: boolean; italic?: boolean; tracking?: number; lineHeight?: number };
// Rendered width from measured per-character advances, interpolated between
// the 400 and 800 masters at the weight the renderer will actually use.
function measure(text: string, size: number, { font, weight = 400, uppercase = false, italic = false, tracking = 0 }: Type) {
  const [regular, heavy] = FONT_ADVANCES[font];
  const t = Math.max(0, Math.min(1, (clampDesignFontWeight(font, weight) - 400) / 400));
  let ems = 0;
  for (const character of uppercase ? text.toUpperCase() : text) {
    const index = character.charCodeAt(0) - 32;
    // Non-ASCII glyphs use the width of "M" as a conservative stand-in.
    const at = index >= 0 && index < 95 ? index : 45;
    ems += regular[at] + (heavy[at] - regular[at]) * t;
  }
  // Kerning and subpixel rounding vary slightly; keep a small margin. Only
  // upright masters are measured, and some italics run noticeably wider.
  return size * (ems * (italic ? 1.1 : 1.02) + tracking * text.length);
}
// Greedy word wrap, matching how the browser breaks pre-wrap text.
function wrappedLines(text: string, width: number, size: number, type: Type) {
  const space = measure(" ", size, type);
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines++;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const wordWidth = measure(word, size, type);
      if (used === 0) used = wordWidth;
      else if (used + space + wordWidth <= width) used += space + wordWidth;
      else { lines++; used = wordWidth; }
      if (wordWidth > width) { lines += Math.ceil(wordWidth / width) - 1; used = wordWidth % width; }
    }
  }
  return lines;
}
function blockHeight(text: string, width: number, size: number, type: Type) {
  return Math.ceil(wrappedLines(text, width, size, type) * size * (type.lineHeight ?? 1.2) + size * 0.25);
}
// Largest size up to maxSize where the longest word fits on one line and the
// wrapped block fits both maxLines and the height budget.
function fitSize(text: string, width: number, type: Type, limits: { maxSize: number; maxLines?: number; maxHeight?: number; minSize?: number }) {
  const minSize = limits.minSize ?? 20;
  const longest = text.split(/\s+/).reduce((widest, word) => measure(word, 1, type) > measure(widest, 1, type) ? word : widest, "");
  let size = Math.floor(limits.maxSize);
  while (size > minSize && (measure(longest, size, type) > width || wrappedLines(text, width, size, type) > (limits.maxLines ?? 99) || blockHeight(text, width, size, type) > (limits.maxHeight ?? Infinity))) size -= 1;
  return Math.max(minSize, size);
}
const estimateWidth = (text: string, size: number, type: Type) => Math.ceil(measure(text, size, type)) + 4;
// A text layer whose box height always matches its estimated wrap.
function textLayer(id: string, role: DesignNode["role"], name: string, text: string, x: number, y: number, width: number, size: number, type: Type, fill: string, extra: Partial<DesignNode> = {}): NodeInput {
  return {
    id, type: "text", role, name, x, y, width, height: blockHeight(text, width, size, type), text, fill,
    fontFamily: type.font, fontSize: size, fontWeight: type.weight ?? 400, lineHeight: type.lineHeight ?? 1.2,
    letterSpacing: (type.tracking ?? 0) * size, ...(type.uppercase ? { textTransform: "uppercase" as const } : {}), ...extra,
  };
}

function metrics({ width, height }: TemplateContext) {
  const unit = Math.min(width, height) / 1080;
  return { u: unit, M: Math.round(80 * unit), landscape: width > height * 1.2 };
}
function brandMark(context: TemplateContext, id: string, x: number, y: number, size: number, fill: string, font: DesignFontFamily, align: "left" | "center" | "right", boxWidth: number): NodeInput {
  const logo = context.assets.find((asset) => asset.kind === "logo");
  if (logo) {
    const width = size * 5;
    return { id, type: "image", role: "logo", name: "Logo", x: align === "left" ? x : align === "center" ? x + (boxWidth - width) / 2 : x + boxWidth - width, y: y - size * 0.4, width, height: size * 1.8, assetId: logo.id, fit: "contain" };
  }
  return textLayer(id, "logo", "Brand name", context.brand.name, x, y, boxWidth, size, { font, weight: 700 }, fill, { align });
}
function counter(context: TemplateContext, right: number, y: number, size: number, fill: string, font: DesignFontFamily, prefix = ""): NodeInput[] {
  if (context.slideCount < 2) return [];
  const text = `${prefix}${String(context.slideIndex + 1).padStart(2, "0")} / ${String(context.slideCount).padStart(2, "0")}`;
  const width = estimateWidth(text, size, { font }) + 8;
  return [textLayer("slide-counter", "label", "Slide counter", text, right - width, y, width, size, { font, weight: 500 }, fill, { align: "right" })];
}
// A centered or left-aligned button: shape plus a vertically centered label.
function button(prefix: string, label: string, x: number, y: number, size: number, type: Type, colors: { fill: string; ink: string; stroke?: string }, options: { minWidth: number; height: number; radius?: number; strokeWidth?: number; shadows?: DesignNode["shadows"]; align?: "left" | "right" }): NodeInput[] {
  const width = Math.max(options.minWidth, estimateWidth(label, size, type) + size * 3);
  const left = options.align === "right" ? x - width : x;
  const labelHeight = Math.ceil(size * (type.lineHeight ?? 1.2) + size * 0.25);
  return [
    { id: `${prefix}-box`, type: "rect", role: "decoration", name: "CTA button", x: left, y, width, height: options.height, fill: colors.fill, radius: options.radius ?? 0, ...(colors.stroke ? { stroke: colors.stroke, strokeWidth: options.strokeWidth ?? 2 } : {}), ...(options.shadows ? { shadows: options.shadows } : {}) },
    { ...textLayer(prefix, "cta", "Call to action", label, left, y + (options.height - labelHeight) / 2, width, size, type, colors.ink, { align: "center" }), height: labelHeight },
  ];
}
// Arrows are drawn: the self-hosted Latin subsets have no U+2192 glyph, so a
// text arrow would render in a fallback font.
function arrow(id: string, x: number, centerY: number, size: number, color: string): NodeInput {
  const width = Math.round(size * 0.9), height = Math.round(size * 0.6), stroke = Math.max(1.5, size * 0.08), inset = stroke;
  const mid = height / 2, head = height / 2 - inset;
  return { id, type: "path", role: "decoration", name: "Arrow", x, y: centerY - height / 2, width, height, fill: "transparent", stroke: color, strokeWidth: round(stroke), path: `M${inset} ${mid} L${width - inset} ${mid} M${round(width - inset - head)} ${inset} L${width - inset} ${mid} L${round(width - inset - head)} ${height - inset}` };
}
// A text CTA followed by a drawn arrow, as one left- or center-aligned group.
function arrowLink(label: string, x: number, y: number, boxWidth: number, size: number, type: Type, color: string, align: "left" | "center"): NodeInput[] {
  const textWidth = estimateWidth(label, size, type), gap = size * 0.4, total = textWidth + gap + size * 0.9;
  const left = align === "center" ? x + (boxWidth - total) / 2 : x;
  const text = textLayer("cta", "cta", "Call to action", label, left, y, Math.min(textWidth, boxWidth), size, type, color);
  return [text, arrow("cta-arrow", left + textWidth + gap, y + size * 0.25 + size * (type.lineHeight ?? 1.2) / 2 - size * 0.08, size, color)];
}
const has = (text: string) => text.trim().length > 0;
const shadow = (x: number, y: number, blur: number, color: string, opacity: number) => [{ x, y, blur, spread: 0, color, opacity }];

// --- Templates ---------------------------------------------------------------
export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "swiss-grid", name: "Swiss grid", mood: "Precise, rational, confident", bestFor: "Feature launches and announcements with a strong headline", headlineMaxChars: 60,
    fonts: { heading: "Inter", body: "Inter" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand), accent = solid(brand.primary, "#f05228");
      const textWidth = W - 2 * M;
      const footerY = H - M - 44 * u;
      const bodyType: Type = { font: fonts.body, lineHeight: 1.35 }, bodyWidth = Math.min(textWidth * 0.66, 760 * u) - 32 * u;
      const bodySize = Math.round(30 * u), bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const bodyY = footerY - 72 * u - bodyHeight;
      const top = M + 150 * u;
      const headType: Type = { font: fonts.heading, weight: 800, tracking: -0.035, lineHeight: 0.95 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(210 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bodyY - 64 * u - top });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      const headlineY = Math.max(top, Math.min(H * 0.24, bodyY - 64 * u - headlineHeight));
      return { background: bg, nodes: [
        { id: "top-rule", type: "rect", name: "Top rule", x: M, y: M, width: textWidth, height: 4 * u, fill: ink },
        textLayer("kicker", "label", "Kicker", copy.kicker, M, M + 28 * u, textWidth / 2, 24 * u, { font: fonts.body, weight: 600, uppercase: true, tracking: 0.08 }, ink),
        brandMark(context, "brand", W / 2, M + 28 * u, 24 * u, ink, fonts.body, "right", W / 2 - M),
        { id: "accent-block", type: "rect", name: "Accent block", x: M, y: headlineY - 48 * u, width: 96 * u, height: 16 * u, fill: accent },
        textLayer("headline", "headline", "Headline", copy.headline, M, headlineY, textWidth, size, headType, ink, { textWrap: "balance" }),
        ...(has(copy.body) ? [
          { id: "body-rule", type: "rect", name: "Body accent", x: M, y: bodyY + 6 * u, width: 8 * u, height: Math.max(8 * u, bodyHeight - 12 * u), fill: accent } as NodeInput,
          textLayer("body", "body", "Body", copy.body, M + 32 * u, bodyY, bodyWidth, bodySize, bodyType, ink),
        ] : []),
        { id: "footer-rule", type: "rect", name: "Footer rule", x: M, y: footerY - 28 * u, width: textWidth, height: 2 * u, fill: ink },
        ...arrowLink(copy.cta, M, footerY, textWidth * 0.7, 30 * u, { font: fonts.body, weight: 700 }, ink, "left"),
        ...counter(context, W - M, footerY + 4 * u, 22 * u, ink, fonts.body),
      ] };
    },
  },
  {
    id: "editorial-serif", name: "Editorial serif", mood: "Premium, literary, calm", bestFor: "Thoughtful launches, essays, premium products", headlineMaxChars: 70,
    fonts: { heading: "Instrument Serif", body: "Inter" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand), accent = solid(brand.primary, "#f05228");
      const textWidth = W - 2 * M, headWidth = textWidth * 0.94;
      const kickerType: Type = { font: fonts.heading, lineHeight: 1.2 }, kickerSize = Math.round(40 * u);
      const bodyType: Type = { font: fonts.body, lineHeight: 1.45 }, bodySize = Math.round(28 * u), bodyWidth = Math.min(W * 0.68, 820 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const ctaType: Type = { font: fonts.body, weight: 600, uppercase: true, tracking: 0.12 }, ctaSize = Math.round(24 * u);
      const top = M + 120 * u, bottom = H - M - 60 * u;
      const fixed = kickerSize * 1.5 + 32 * u + 48 * u + bodyHeight + 64 * u + ctaSize * 2;
      const headType: Type = { font: fonts.heading, tracking: -0.01, lineHeight: 0.98 };
      const size = fitSize(copy.headline, headWidth, headType, { maxSize: Math.min(200 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top - fixed });
      const headlineHeight = blockHeight(copy.headline, headWidth, size, headType);
      let y = Math.max(top, top + (bottom - top - fixed - headlineHeight) / 2);
      const kickerY = y; y += kickerSize * 1.5 + 32 * u;
      const headlineY = y; y += headlineHeight + 48 * u;
      const bodyY = y; y += bodyHeight + (has(copy.body) ? 64 * u : 0);
      const ctaWidth = estimateWidth(copy.cta, ctaSize, ctaType);
      return { background: bg, nodes: [
        brandMark(context, "brand", M, M, 26 * u, ink, fonts.body, "center", textWidth),
        { id: "masthead-rule", type: "rect", name: "Masthead rule", x: M, y: M + 56 * u, width: textWidth, height: 1.5 * u, fill: ink },
        { id: "masthead-rule-2", type: "rect", name: "Masthead rule", x: M, y: M + 64 * u, width: textWidth, height: 1.5 * u, fill: ink },
        textLayer("kicker", "label", "Kicker", copy.kicker, M, kickerY, textWidth, kickerSize, kickerType, ink, { fontStyle: "italic", align: "center" }),
        textLayer("headline", "headline", "Headline", copy.headline, (W - headWidth) / 2, headlineY, headWidth, size, headType, ink, { align: "center", textWrap: "balance" }),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, (W - bodyWidth) / 2, bodyY, bodyWidth, bodySize, bodyType, ink, { align: "center", textWrap: "balance" })] : []),
        textLayer("cta", "cta", "Call to action", copy.cta, (W - ctaWidth) / 2, y, ctaWidth, ctaSize, ctaType, ink, { align: "center" }),
        { id: "cta-underline", type: "rect", name: "CTA underline", x: (W - ctaWidth) / 2, y: y + ctaSize * 1.55, width: ctaWidth, height: 4 * u, fill: accent },
        { id: "footer-rule", type: "rect", name: "Footer rule", x: M, y: H - M - 2 * u, width: textWidth, height: 1.5 * u, fill: ink },
        ...counter(context, W - M, H - M - 40 * u, 20 * u, ink, fonts.body),
      ] };
    },
  },
  {
    id: "dark-aurora", name: "Dark aurora", mood: "Atmospheric, modern, cinematic", bestFor: "AI products, launches that should feel premium and new", headlineMaxChars: 60,
    fonts: { heading: "Instrument Serif", body: "Space Grotesk" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const primary = solid(brand.primary, "#f05228");
      const bg = isDark(solid(brand.secondary, "#181818")) ? mix(solid(brand.secondary, "#181818"), "#000000", 0.35) : "#0e0d0b";
      const light = "#f5f3ef";
      const textWidth = W - 2 * M, headWidth = textWidth * 0.92;
      const ctaType: Type = { font: fonts.body, weight: 700 }, ctaHeight = 96 * u;
      const ctaY = H - M - 64 * u - ctaHeight;
      const bodyType: Type = { font: fonts.body, lineHeight: 1.3 }, bodySize = Math.round(32 * u), bodyWidth = Math.min(textWidth * 0.75, 780 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const top = M + 110 * u, bottom = ctaY - 56 * u - bodyHeight - (has(copy.body) ? 40 * u : 0);
      const italic = designFont(fonts.heading).italic;
      const headType: Type = { font: fonts.heading, italic, tracking: -0.02, lineHeight: 0.95 };
      const size = fitSize(copy.headline, headWidth, headType, { maxSize: Math.min(180 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top });
      const headlineHeight = blockHeight(copy.headline, headWidth, size, headType);
      const headlineY = Math.max(top, Math.min(H * 0.42 - headlineHeight / 2, bottom - headlineHeight));
      return { background: bg, nodes: [
        { id: "glow-primary", type: "ellipse", name: "Primary glow", x: 0, y: 0, width: W * 0.8, height: H * 0.62, fill: primary, blur: 170 * u, opacity: 0.85 },
        { id: "glow-secondary", type: "ellipse", name: "Secondary glow", x: W * 0.35, y: H * 0.5, width: W * 0.65, height: H * 0.5, fill: companionHue(primary, brand), blur: 190 * u, opacity: 0.55 },
        { id: "grain", type: "rect", name: "Grain", x: 0, y: 0, width: W, height: H, fill: "transparent", pattern: { kind: "grain", color: "#ffffff", opacity: 0.14, size: 12 }, blendMode: "overlay" },
        textLayer("kicker", "label", "Kicker", copy.kicker, M, M + 16 * u, textWidth * 0.7, 26 * u, { font: fonts.body, weight: 600, uppercase: true, tracking: 0.15 }, light),
        ...counter(context, W - M, M + 18 * u, 22 * u, light, fonts.body),
        textLayer("headline", "headline", "Headline", copy.headline, M, headlineY, headWidth, size, headType, light, { fontStyle: italic ? "italic" : "normal", gradient: { kind: "linear", angle: 160, centerX: 50, centerY: 50, stops: [{ color: "#fff6ef", position: 0, opacity: 1 }, { color: mix(primary, "#ffffff", 0.55), position: 100, opacity: 1 }] } }),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, M, headlineY + headlineHeight + 40 * u, bodyWidth, bodySize, bodyType, light)] : []),
        ...button("cta", copy.cta, W - M - 10 * u, ctaY, 32 * u, ctaType, { fill: light, ink: bg }, { minWidth: 300 * u, height: ctaHeight, shadows: shadow(10 * u, 10 * u, 0, primary, 1), align: "right" }),
        brandMark(context, "brand", M, H - M - 36 * u, 26 * u, light, fonts.body, "left", W / 2 - M),
      ] };
    },
  },
  {
    id: "big-type", name: "Big type", mood: "Loud, energetic, unmissable", bestFor: "Short punchy headlines, events, big announcements", headlineMaxChars: 40,
    fonts: { heading: "Anton", body: "Archivo" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.primary, "#f05228"), ink = inkOn(bg, brand, 3);
      const textWidth = W - 2 * M;
      const ctaType: Type = { font: fonts.body, weight: 800, uppercase: true, tracking: 0.06 }, ctaSize = Math.round(26 * u), ctaHeight = 84 * u;
      const ctaWidth = Math.max(240 * u, estimateWidth(copy.cta, ctaSize, ctaType) + ctaSize * 3);
      // The body shares the bottom band with the CTA; wide CTAs stack above it.
      const sideBySide = textWidth - ctaWidth - 48 * u >= textWidth * 0.42;
      const bodyType: Type = { font: fonts.body, weight: 500, lineHeight: 1.3 }, bodySize = Math.round(30 * u);
      const bodyWidth = sideBySide ? Math.min(textWidth - ctaWidth - 48 * u, 640 * u) : Math.min(textWidth, 720 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const bodyY = H - M - (sideBySide ? bodyHeight : bodyHeight + ctaHeight + 32 * u);
      const ctaY = H - M - ctaHeight;
      const bandTop = Math.min(bodyY, ctaY) - 72 * u;
      const top = M + 90 * u;
      const headType: Type = { font: fonts.heading, uppercase: true, lineHeight: 0.9 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(330 * u, context.maxHeadlineSize ?? Infinity), maxLines: 6, maxHeight: bandTop - top });
      return { background: bg, nodes: [
        textLayer("kicker", "label", "Kicker", copy.kicker, M, M, textWidth * 0.6, 26 * u, { font: fonts.body, weight: 800, uppercase: true, tracking: 0.1 }, ink),
        brandMark(context, "brand", W / 2, M, 26 * u, ink, fonts.body, "right", W / 2 - M),
        textLayer("headline", "headline", "Headline", copy.headline, M, top, textWidth, size, headType, ink),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, M, bodyY, bodyWidth, bodySize, bodyType, ink)] : []),
        ...button("cta", copy.cta, sideBySide ? W - M : M + ctaWidth, ctaY, ctaSize, ctaType, { fill: "transparent", ink, stroke: ink }, { minWidth: ctaWidth, height: ctaHeight, radius: ctaHeight / 2, strokeWidth: 4 * u, align: "right" }),
        ...counter(context, W - M, bandTop + 16 * u, 22 * u, ink, fonts.body),
      ] };
    },
  },
  {
    id: "brutalist", name: "Brutalist frame", mood: "Raw, honest, indie-hacker", bestFor: "Developer tools, indie launches, bold opinions", headlineMaxChars: 60,
    fonts: { heading: "Space Grotesk", body: "Space Mono" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand, 7), accent = solid(brand.primary, "#f05228");
      const frame = Math.round(M / 2), pad = M, textWidth = W - 2 * pad, barHeight = 72 * u;
      const ctaHeight = 96 * u, ctaY = H - frame - 60 * u - ctaHeight;
      const bodyType: Type = { font: fonts.body, lineHeight: 1.45 }, bodySize = Math.round(26 * u), bodyWidth = Math.min(textWidth * 0.85, 840 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const top = frame + barHeight + Math.max(72 * u, H * 0.1);
      const bottom = ctaY - 64 * u - bodyHeight - (has(copy.body) ? 48 * u : 0);
      const headType: Type = { font: fonts.heading, weight: 700, tracking: -0.03, lineHeight: 1 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(170 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      const labelType: Type = { font: fonts.body, weight: 700, uppercase: true };
      return { background: bg, nodes: [
        { id: "frame", type: "rect", name: "Frame", x: frame, y: frame, width: W - 2 * frame, height: H - 2 * frame, fill: "transparent", stroke: ink, strokeWidth: 6 * u },
        { id: "bar", type: "rect", name: "Header bar", x: frame, y: frame, width: W - 2 * frame, height: barHeight, fill: ink },
        textLayer("kicker", "label", "Kicker", `■ ${copy.kicker}`, pad, frame + (barHeight - 24 * u * 1.45) / 2, textWidth * 0.7, 24 * u, labelType, bg),
        ...counter(context, W - pad, frame + (barHeight - 22 * u * 1.45) / 2, 22 * u, bg, fonts.body),
        textLayer("headline", "headline", "Headline", copy.headline, pad, top, textWidth, size, headType, ink),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, pad, top + headlineHeight + 48 * u, bodyWidth, bodySize, bodyType, ink)] : []),
        ...button("cta", copy.cta, pad, ctaY, 30 * u, { font: fonts.heading, weight: 700 }, { fill: accent, ink: inkOn(accent, brand, 3), stroke: ink }, { minWidth: 320 * u, height: ctaHeight, strokeWidth: 4 * u, shadows: shadow(12 * u, 12 * u, 0, ink, 1) }),
        brandMark(context, "brand", W / 2, ctaY + ctaHeight - 40 * u, 24 * u, ink, fonts.body, "right", W / 2 - pad),
      ] };
    },
  },
  {
    id: "split-field", name: "Split field", mood: "Graphic, bold color blocking", bestFor: "Brand-forward announcements and product updates", headlineMaxChars: 50,
    fonts: { heading: "Bricolage Grotesque", body: "Inter" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M, landscape } = metrics(context);
      const top = solid(brand.primary, "#f05228"), bottom = solid(brand.background, "#f5f3ef");
      const topInk = inkOn(top, brand, 3), bottomInk = inkOn(bottom, brand);
      const split = landscape ? W * 0.58 : H * 0.6;
      const headWidth = landscape ? split - 2 * M : W - 2 * M;
      const headTop = M + 80 * u, headBottom = landscape ? H - M : split - 56 * u;
      const headType: Type = { font: fonts.heading, weight: 700, tracking: -0.03, lineHeight: 0.95 };
      const size = fitSize(copy.headline, headWidth, headType, { maxSize: Math.min(190 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: headBottom - headTop });
      const headlineHeight = blockHeight(copy.headline, headWidth, size, headType);
      const restX = landscape ? split + M : M, restWidth = landscape ? W - split - 2 * M : W - 2 * M;
      const restY = landscape ? M + 120 * u : split + 56 * u;
      const ctaHeight = 90 * u, ctaY = H - M - ctaHeight;
      const bodyType: Type = { font: fonts.body, lineHeight: 1.35 }, bodyWidth = Math.min(restWidth, 760 * u);
      const bodySize = has(copy.body) ? fitSize(copy.body, bodyWidth, bodyType, { maxSize: 30 * u, maxHeight: ctaY - 40 * u - restY, minSize: 16 }) : 0;
      return { background: bottom, nodes: [
        { id: "field", type: "rect", name: "Color field", x: 0, y: 0, width: landscape ? split : W, height: landscape ? H : split, fill: top, pattern: { kind: "grain", color: "#000000", opacity: 0.1, size: 12 } },
        textLayer("kicker", "label", "Kicker", copy.kicker, M, M, headWidth * 0.7, 26 * u, { font: fonts.body, weight: 600 }, topInk),
        textLayer("headline", "headline", "Headline", copy.headline, M, headBottom - headlineHeight, headWidth, size, headType, topInk),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, restX, restY, bodyWidth, bodySize, bodyType, bottomInk)] : []),
        ...button("cta", copy.cta, restX, ctaY, 28 * u, { font: fonts.body, weight: 700 }, { fill: bottomInk, ink: bottom }, { minWidth: 280 * u, height: ctaHeight, radius: ctaHeight / 2 }),
        { id: "dots", type: "rect", name: "Dot texture", x: W - M - 200 * u, y: H - M - 120 * u, width: 200 * u, height: 120 * u, fill: "transparent", pattern: { kind: "dots", color: bottomInk, opacity: 0.3, size: 20 * u } },
        brandMark(context, "brand", landscape ? restX : W / 2, M, 26 * u, landscape ? bottomInk : topInk, fonts.body, "right", landscape ? restWidth : W / 2 - M),
        ...counter(context, W - M, landscape ? M + 56 * u : split + 16 * u, 22 * u, bottomInk, fonts.body),
      ] };
    },
  },
  {
    id: "tech-grid", name: "Tech grid", mood: "Technical, engineered, developer-native", bestFor: "APIs, developer tools, infrastructure and data products", headlineMaxChars: 60,
    fonts: { heading: "Space Grotesk", body: "JetBrains Mono" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const primary = solid(brand.primary, "#f05228");
      const bg = "#0b0d10", light = "#f2f4f7", muted = "#a9b0bb";
      const accent = contrastRatio(primary, bg) >= 4.5 ? primary : mix(primary, "#ffffff", 0.45);
      const textWidth = W - 2 * M;
      const ctaHeight = 84 * u, ctaY = H - M - ctaHeight;
      const bodyType: Type = { font: fonts.body, lineHeight: 1.5 }, bodySize = Math.round(26 * u), bodyWidth = Math.min(textWidth * 0.85, 860 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const top = Math.max(M + 160 * u, H * 0.26), bottom = ctaY - 64 * u - bodyHeight - (has(copy.body) ? 40 * u : 0);
      const headType: Type = { font: fonts.heading, weight: 600, tracking: -0.03, lineHeight: 1 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(160 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      return { background: bg, nodes: [
        { id: "grid", type: "rect", name: "Grid", x: 0, y: 0, width: W, height: H, fill: "transparent", pattern: { kind: "grid", color: "#ffffff", opacity: 0.07, size: 54 * u } },
        { id: "glow", type: "ellipse", name: "Accent glow", x: W * 0.45, y: H * 0.04, width: W * 0.5, height: W * 0.5, fill: primary, blur: 160 * u, opacity: 0.35 },
        textLayer("kicker", "label", "Kicker", `$ ${copy.kicker.toLowerCase()}`, M, M, textWidth * 0.75, 24 * u, { font: fonts.body, weight: 500 }, accent),
        ...counter(context, W - M, M, 22 * u, muted, fonts.body, "// "),
        { id: "rule", type: "rect", name: "Accent line", x: M, y: top - 48 * u, width: textWidth * 0.5, height: 6 * u, fill: "transparent", gradient: { kind: "linear", angle: 90, centerX: 50, centerY: 50, stops: [{ color: primary, position: 0, opacity: 1 }, { color: primary, position: 100, opacity: 0 }] } },
        textLayer("headline", "headline", "Headline", copy.headline, M, top, textWidth, size, headType, light, { textWrap: "balance" }),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, M, top + headlineHeight + 40 * u, bodyWidth, bodySize, bodyType, muted)] : []),
        ...button("cta", copy.cta, M, ctaY, 26 * u, { font: fonts.body, weight: 700 }, { fill: accent, ink: inkOn(accent, brand) }, { minWidth: 300 * u, height: ctaHeight, radius: 10 * u }),
        brandMark(context, "brand", W / 2, ctaY + (ctaHeight - 34 * u) / 2, 24 * u, light, fonts.body, "right", W / 2 - M),
      ] };
    },
  },
  {
    id: "spotlight", name: "Centered spotlight", mood: "Friendly, polished, classic launch", bestFor: "SaaS launches, waitlists, product announcements", headlineMaxChars: 56,
    fonts: { heading: "Bricolage Grotesque", body: "Inter" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand), primary = solid(brand.primary, "#f05228");
      const textWidth = Math.min(W - 2 * M, 960 * u);
      const chipType: Type = { font: fonts.body, weight: 600 }, chipSize = Math.round(24 * u), chipHeight = 60 * u;
      const chipWidth = Math.min(textWidth, estimateWidth(copy.kicker, chipSize, chipType) + 56 * u);
      const bodyType: Type = { font: fonts.body, lineHeight: 1.4 }, bodySize = Math.round(30 * u), bodyWidth = Math.min(textWidth * 0.82, 780 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const ctaHeight = 92 * u, top = M + 110 * u, bottom = H - M - 40 * u;
      const fixed = chipHeight + 48 * u + 40 * u + bodyHeight + 64 * u + ctaHeight;
      const headType: Type = { font: fonts.heading, weight: 700, tracking: -0.03, lineHeight: 1 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(150 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top - fixed });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      let y = Math.max(top, (H - fixed - headlineHeight) / 2);
      const chipY = y; y += chipHeight + 48 * u;
      const headlineY = y; y += headlineHeight + 40 * u;
      const bodyY = y; y += bodyHeight + 64 * u;
      return { background: bg, nodes: [
        { id: "spotlight", type: "rect", name: "Spotlight", x: 0, y: 0, width: W, height: H, fill: "transparent", gradient: { kind: "radial", angle: 0, centerX: 50, centerY: 40, stops: [{ color: primary, position: 0, opacity: 0.28 }, { color: primary, position: 60, opacity: 0 }] } },
        { id: "grain", type: "rect", name: "Grain", x: 0, y: 0, width: W, height: H, fill: "transparent", pattern: { kind: "grain", color: "#000000", opacity: 0.06, size: 12 } },
        brandMark(context, "brand", M, M, 26 * u, ink, fonts.body, "center", W - 2 * M),
        { id: "chip", type: "rect", name: "Kicker chip", x: (W - chipWidth) / 2, y: chipY, width: chipWidth, height: chipHeight, fill: "transparent", stroke: primary, strokeWidth: 2 * u, radius: chipHeight / 2 },
        { ...textLayer("kicker", "label", "Kicker", copy.kicker, (W - chipWidth) / 2, chipY + (chipHeight - chipSize * 1.45) / 2, chipWidth, chipSize, chipType, ink, { align: "center" }), height: Math.ceil(chipSize * 1.45) },
        textLayer("headline", "headline", "Headline", copy.headline, (W - textWidth) / 2, headlineY, textWidth, size, headType, ink, { align: "center", textWrap: "balance" }),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, (W - bodyWidth) / 2, bodyY, bodyWidth, bodySize, bodyType, ink, { align: "center", textWrap: "balance" })] : []),
        ...(() => { const parts = button("cta", copy.cta, 0, y, 30 * u, { font: fonts.body, weight: 600 }, { fill: ink, ink: bg }, { minWidth: 300 * u, height: ctaHeight, radius: ctaHeight / 2, shadows: shadow(0, 18 * u, 40 * u, "#000000", 0.18) }); const shift = (W - parts[0].width) / 2; return parts.map((part) => ({ ...part, x: part.x + shift })); })(),
        ...counter(context, W - M, H - M - 30 * u, 20 * u, ink, fonts.body),
      ] };
    },
  },
  {
    id: "product-hero", name: "Product hero", mood: "Clear, product-first, trustworthy", bestFor: "Showing a screenshot or product photo", headlineMaxChars: 56, requiresImage: true,
    fonts: { heading: "Sora", body: "DM Sans" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy, assets } = context;
      const { u, M, landscape } = metrics(context);
      const image = assets.find((asset) => asset.kind === "image")!;
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand), primary = solid(brand.primary, "#f05228");
      const textWidth = landscape ? W * 0.42 - M : W - 2 * M;
      const headType: Type = { font: fonts.heading, weight: 700, tracking: -0.025, lineHeight: 1.05 };
      const bodyType: Type = { font: fonts.body, lineHeight: 1.4 }, bodySize = Math.round(28 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, textWidth, bodySize, bodyType) : 0;
      const ctaHeight = 84 * u;
      const imageTop = M + 90 * u;
      // Text takes what it needs below the image, and the image never drops
      // below a third of the canvas.
      const textBudget = landscape ? H - 2 * M - 90 * u - bodyHeight - ctaHeight - 80 * u : H - M - imageTop - H * 0.34 - 56 * u - bodyHeight - 32 * u - 40 * u - ctaHeight;
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(120 * u, context.maxHeadlineSize ?? Infinity), maxLines: 4, maxHeight: textBudget });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      const textBlock = headlineHeight + 32 * u + bodyHeight + (has(copy.body) ? 40 * u : 0) + ctaHeight;
      const frame = landscape
        ? { x: W * 0.46, y: M, width: W * 0.54 - M, height: H - 2 * M }
        : { x: M, y: imageTop, width: W - 2 * M, height: H - M - textBlock - 56 * u - imageTop };
      const headlineY = landscape ? Math.max(M + 90 * u, (H - textBlock) / 2) : frame.y + frame.height + 56 * u;
      const bodyY = headlineY + headlineHeight + 32 * u;
      const ctaY = bodyY + bodyHeight + (has(copy.body) ? 40 * u : 0);
      const kicker = landscape
        ? textLayer("kicker", "label", "Kicker", copy.kicker, M, headlineY - 56 * u, textWidth, 24 * u, { font: fonts.body, weight: 600 }, ink)
        : textLayer("kicker", "label", "Kicker", copy.kicker, W / 2, M + 4 * u, W / 2 - M, 24 * u, { font: fonts.body, weight: 600 }, ink, { align: "right" });
      return { background: bg, nodes: [
        { id: "backdrop", type: "rect", name: "Image backdrop", x: frame.x, y: frame.y, width: frame.width, height: frame.height, fill: mix(primary, bg, 0.82), radius: 28 * u },
        { id: "product-image", type: "image", name: image.name.slice(0, 100) || "Product image", x: frame.x + 24 * u, y: frame.y + 24 * u, width: frame.width - 48 * u, height: frame.height - 48 * u, assetId: image.id, fit: "contain", radius: 16 * u, shadows: shadow(0, 24 * u, 60 * u, "#000000", 0.18) },
        brandMark(context, "brand", M, M + 4 * u, 26 * u, ink, fonts.body, "left", landscape ? textWidth : W / 2 - M),
        kicker,
        textLayer("headline", "headline", "Headline", copy.headline, M, headlineY, textWidth, size, headType, ink),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, M, bodyY, textWidth, bodySize, bodyType, ink)] : []),
        ...button("cta", copy.cta, M, ctaY, 28 * u, { font: fonts.body, weight: 700 }, { fill: primary, ink: inkOn(primary, brand, 3) }, { minWidth: 280 * u, height: ctaHeight, radius: 14 * u }),
        ...counter(context, W - M, H - M - 28 * u, 20 * u, ink, fonts.body),
      ] };
    },
  },
  {
    id: "outline-echo", name: "Outline echo", mood: "Kinetic, playful, streetwear-adjacent", bestFor: "Short memorable headlines and hype moments", headlineMaxChars: 32,
    fonts: { heading: "Unbounded", body: "Plus Jakarta Sans" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const primary = solid(brand.primary, "#f05228");
      const bg = isDark(solid(brand.secondary, "#181818")) ? solid(brand.secondary, "#181818") : "#121212", light = "#f7f5f0";
      const offset = 14 * u, textWidth = W - 2 * M - 2 * offset;
      const ctaHeight = 84 * u, ctaY = H - M - ctaHeight;
      const bodyType: Type = { font: fonts.body, weight: 500, lineHeight: 1.35 }, bodySize = Math.round(30 * u), bodyWidth = Math.min(W - 2 * M, 760 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const top = M + 100 * u, bottom = ctaY - 56 * u - bodyHeight - (has(copy.body) ? 56 * u : 0);
      const headType: Type = { font: fonts.heading, weight: 700, uppercase: true, lineHeight: 1 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(190 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      const headlineY = Math.max(top, Math.min(H * 0.4 - headlineHeight / 2, bottom - headlineHeight));
      const echo = (id: string, x: number, opacity: number) => textLayer(id, "decoration", "Headline echo", copy.headline, x, headlineY, textWidth, size, headType, "transparent", { stroke: primary, strokeWidth: 2 * u, opacity });
      return { background: bg, nodes: [
        echo("echo-2", M + 2 * offset, 0.45),
        echo("echo-1", M + offset, 0.8),
        textLayer("headline", "headline", "Headline", copy.headline, M, headlineY, textWidth, size, headType, light),
        textLayer("kicker", "label", "Kicker", copy.kicker, M, M, (W - 2 * M) * 0.7, 26 * u, { font: fonts.body, weight: 700, uppercase: true, tracking: 0.12 }, contrastRatio(primary, bg) >= 3 ? primary : light),
        ...counter(context, W - M, M + 2 * u, 22 * u, light, fonts.body),
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, M, headlineY + headlineHeight + 56 * u, bodyWidth, bodySize, bodyType, light)] : []),
        ...button("cta", copy.cta, W - M, ctaY, 26 * u, { font: fonts.body, weight: 800, uppercase: true, tracking: 0.06 }, { fill: primary, ink: inkOn(primary, brand, 3) }, { minWidth: 260 * u, height: ctaHeight, radius: ctaHeight / 2, align: "right" }),
        brandMark(context, "brand", M, ctaY + (ctaHeight - 36 * u) / 2, 26 * u, light, fonts.body, "left", W / 2 - M),
      ] };
    },
  },
  {
    id: "quiet-minimal", name: "Quiet minimal", mood: "Calm, restrained, lots of air", bestFor: "Premium brands, subtle updates, design-led products", headlineMaxChars: 70,
    fonts: { heading: "Fraunces", body: "Manrope" },
    build(context, fonts) {
      const { width: W, height: H, brand, copy } = context;
      const { u, M } = metrics(context);
      const bg = solid(brand.background, "#f5f3ef"), ink = inkOn(bg, brand), accent = solid(brand.primary, "#f05228");
      const textWidth = Math.min(W - 4 * M, 820 * u);
      const bodyType: Type = { font: fonts.body, lineHeight: 1.5 }, bodySize = Math.round(26 * u), bodyWidth = Math.min(textWidth * 0.85, 680 * u);
      const bodyHeight = has(copy.body) ? blockHeight(copy.body, bodyWidth, bodySize, bodyType) : 0;
      const top = M + 120 * u, bottom = H - M - 120 * u;
      const fixed = 36 * u + 32 * u + 56 * u + 4 * u + 56 * u + bodyHeight;
      const headType: Type = { font: fonts.heading, tracking: -0.02, lineHeight: 1.1 };
      const size = fitSize(copy.headline, textWidth, headType, { maxSize: Math.min(104 * u, context.maxHeadlineSize ?? Infinity), maxLines: 5, maxHeight: bottom - top - fixed });
      const headlineHeight = blockHeight(copy.headline, textWidth, size, headType);
      let y = Math.max(top, (H - fixed - headlineHeight) / 2 - 20 * u);
      const kickerY = y; y += 36 * u + 32 * u;
      const headlineY = y; y += headlineHeight + 56 * u;
      const ruleY = y; y += 4 * u + 56 * u;
      return { background: bg, nodes: [
        brandMark(context, "brand", M, M, 24 * u, ink, fonts.body, "center", W - 2 * M),
        textLayer("kicker", "label", "Kicker", copy.kicker, M, kickerY, W - 2 * M, 22 * u, { font: fonts.body, weight: 600, uppercase: true, tracking: 0.18 }, ink, { align: "center" }),
        textLayer("headline", "headline", "Headline", copy.headline, (W - textWidth) / 2, headlineY, textWidth, size, headType, ink, { align: "center", textWrap: "balance" }),
        { id: "rule", type: "rect", name: "Accent rule", x: (W - 80 * u) / 2, y: ruleY, width: 80 * u, height: 4 * u, fill: accent },
        ...(has(copy.body) ? [textLayer("body", "body", "Body", copy.body, (W - bodyWidth) / 2, y, bodyWidth, bodySize, bodyType, ink, { align: "center", textWrap: "balance" })] : []),
        ...arrowLink(copy.cta, M, H - M - 44 * u, W - 2 * M, 28 * u, { font: fonts.body, weight: 700 }, ink, "center"),
        ...counter(context, W - M, M, 20 * u, ink, fonts.body),
      ] };
    },
  },
];

export function availableTemplates(assets: DesignAsset[]) {
  return LAYOUT_TEMPLATES.filter((template) => !template.requiresImage || assets.some((asset) => asset.kind === "image"));
}
export function templateFonts(template: LayoutTemplate, brand: BrandKit): Fonts {
  // An untouched default kit defers to the template's tested pairing.
  return brand.headingFont === "Outfit" && brand.bodyFont === "Outfit" ? template.fonts : { heading: brand.headingFont, body: brand.bodyFont };
}
const round = (value: number) => Math.round(value * 10) / 10;
// Models often emit typographic hyphens and spaces that the self-hosted
// Latin subsets lack; map them to equivalents every face has.
const normalizeSlot = (text: string) => text.replace(/[\u2010\u2011\u2012]/g, "-").replace(/[\u00a0\u2007\u202f]/g, " ");
export function buildTemplatePage(template: LayoutTemplate, input: TemplateContext, pageId: string, name: string): DesignPage {
  const context = { ...input, copy: { kicker: normalizeSlot(input.copy.kicker), headline: normalizeSlot(input.copy.headline), body: normalizeSlot(input.copy.body), cta: normalizeSlot(input.copy.cta) } };
  const fonts = templateFonts(template, context.brand);
  const { background, nodes } = template.build(context, fonts);
  return designPageSchema.parse({ id: pageId, name, width: context.width, height: context.height, background, nodes: nodes.map((node) => ({
    ...node,
    x: round(node.x), y: round(node.y), width: Math.max(1, round(node.width)), height: Math.max(1, round(node.height)),
    // Very large canvases scale past schema limits; clamp rather than reject.
    ...(node.fontSize === undefined ? {} : { fontSize: Math.max(8, Math.min(600, Math.round(node.fontSize))) }),
    ...(node.letterSpacing === undefined ? {} : { letterSpacing: Math.max(-20, Math.min(60, round(node.letterSpacing))) }),
    ...(node.blur === undefined ? {} : { blur: Math.min(200, round(node.blur)) }),
    ...(node.strokeWidth === undefined ? {} : { strokeWidth: Math.min(100, round(node.strokeWidth)) }),
    ...(node.radius === undefined ? {} : { radius: Math.min(2048, round(node.radius)) }),
    ...(node.pattern ? { pattern: { ...node.pattern, size: Math.max(2, Math.min(400, round(node.pattern.size))) } } : {}),
    ...(node.shadows ? { shadows: node.shadows.map((item) => ({ ...item, x: Math.max(-400, Math.min(400, round(item.x))), y: Math.max(-400, Math.min(400, round(item.y))), blur: Math.min(400, round(item.blur)) })) } : {}),
    ...(node.text === undefined ? {} : { text: node.text.slice(0, 4000) }),
  })) });
}
// Builds every slide of a carousel at the largest headline size that fits on
// all of them, so type size and position stay steady while swiping.
export function buildTemplateSlides(template: LayoutTemplate, base: Omit<TemplateContext, "copy" | "slideIndex" | "slideCount">, slides: TemplateCopy[], name: (index: number) => string): DesignPage[] {
  const build = (maxHeadlineSize?: number) => slides.map((copy, index) => buildTemplatePage(template, { ...base, copy, slideIndex: index, slideCount: slides.length, maxHeadlineSize }, `page-${index + 1}`, name(index)));
  const first = build();
  if (slides.length < 2) return first;
  const shared = Math.min(...first.map((page) => page.nodes.find((node) => node.role === "headline")?.fontSize ?? Infinity));
  return Number.isFinite(shared) ? build(shared) : first;
}
