// Curated open-licensed (SIL OFL) families from Fontsource, self-hosted under
// public/design-fonts. The editor loads them by URL; the renderer embeds the
// same files as data URLs so exports match the canvas.
export type DesignFontCategory = "sans" | "serif" | "display" | "mono" | "system";
export type DesignFontFace = { file: string; style: "normal" | "italic"; weight: [number, number]; subset: "latin" | "latin-ext" };
export type DesignFontDefinition = { family: string; category: DesignFontCategory; weights: [number, number]; italic: boolean; faces: DesignFontFace[]; fallback: string };

const LATIN_RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT_RANGE = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const FALLBACK: Record<DesignFontCategory, string> = { sans: "sans-serif", serif: "serif", display: "sans-serif", mono: "monospace", system: "sans-serif" };

function variable(family: string, slug: string, category: DesignFontCategory, weights: [number, number], italic: boolean): DesignFontDefinition {
  const styles = italic ? ["normal", "italic"] as const : ["normal"] as const;
  return { family, category, weights, italic, fallback: FALLBACK[category], faces: styles.flatMap((style) => (["latin", "latin-ext"] as const).map((subset) => ({ file: `${slug}-${subset}-wght-${style}.woff2`, style, weight: weights, subset }))) };
}
function fixed(family: string, slug: string, category: DesignFontCategory, weights: number[], italic: boolean): DesignFontDefinition {
  const styles = italic ? ["normal", "italic"] as const : ["normal"] as const;
  return { family, category, weights: [Math.min(...weights), Math.max(...weights)], italic, fallback: FALLBACK[category], faces: weights.flatMap((weight) => styles.flatMap((style) => (["latin", "latin-ext"] as const).map((subset) => ({ file: `${slug}-${subset}-${weight}-${style}.woff2`, style, weight: [weight, weight] as [number, number], subset })))) };
}
function system(family: string, category: DesignFontCategory): DesignFontDefinition {
  return { family, category, weights: [100, 900], italic: true, faces: [], fallback: FALLBACK[category] };
}

export const DESIGN_FONT_CATALOG = [
  // Outfit is the application font; its files live in src/app/fonts.
  { family: "Outfit", category: "sans", weights: [100, 900], italic: false, faces: [], fallback: "sans-serif" },
  variable("Inter", "inter", "sans", [100, 900], true),
  variable("Space Grotesk", "space-grotesk", "sans", [300, 700], false),
  variable("Manrope", "manrope", "sans", [200, 800], false),
  variable("DM Sans", "dm-sans", "sans", [100, 900], true),
  variable("Plus Jakarta Sans", "plus-jakarta-sans", "sans", [200, 800], true),
  variable("Bricolage Grotesque", "bricolage-grotesque", "sans", [200, 800], false),
  variable("Archivo", "archivo", "sans", [100, 900], true),
  variable("Sora", "sora", "sans", [100, 800], false),
  variable("Syne", "syne", "display", [400, 800], false),
  variable("Unbounded", "unbounded", "display", [200, 900], false),
  variable("Big Shoulders Display", "big-shoulders-display", "display", [100, 900], false),
  fixed("Anton", "anton", "display", [400], false),
  fixed("Bebas Neue", "bebas-neue", "display", [400], false),
  variable("Fraunces", "fraunces", "serif", [100, 900], true),
  variable("Playfair Display", "playfair-display", "serif", [400, 900], true),
  variable("Newsreader", "newsreader", "serif", [200, 800], true),
  variable("Bodoni Moda", "bodoni-moda", "serif", [400, 900], true),
  fixed("Instrument Serif", "instrument-serif", "serif", [400], true),
  fixed("DM Serif Display", "dm-serif-display", "serif", [400], true),
  variable("JetBrains Mono", "jetbrains-mono", "mono", [100, 800], true),
  fixed("Space Mono", "space-mono", "mono", [400, 700], true),
  system("Arial", "system"), system("Georgia", "serif"), system("Verdana", "system"), system("Courier New", "mono"),
] as const satisfies readonly DesignFontDefinition[];

export type DesignFontFamily = typeof DESIGN_FONT_CATALOG[number]["family"];
export const DESIGN_FONTS = DESIGN_FONT_CATALOG.map((font) => font.family) as [DesignFontFamily, ...DesignFontFamily[]];
export const DESIGN_FONT_URL_PREFIX = "/design-fonts/";

export function designFont(family: string): DesignFontDefinition {
  return DESIGN_FONT_CATALOG.find((font) => font.family === family) ?? DESIGN_FONT_CATALOG[0];
}
export function designFontStack(family: string) {
  const font = designFont(family);
  return `"${font.family}", ${font.fallback}`;
}
// Fixed-weight families are never synthesized bolder; clamp to real masters.
export function clampDesignFontWeight(family: string, weight: number) {
  const [min, max] = designFont(family).weights;
  return Math.max(min, Math.min(max, weight));
}
export function designFontFaceCss(families: Iterable<string>, source: (file: string) => string) {
  const rules: string[] = [];
  for (const family of new Set(families)) {
    for (const face of designFont(family).faces) {
      const weight = face.weight[0] === face.weight[1] ? `${face.weight[0]}` : `${face.weight[0]} ${face.weight[1]}`;
      rules.push(`@font-face{font-family:"${family}";src:url(${source(face.file)}) format('woff2');font-weight:${weight};font-style:${face.style};font-display:block;unicode-range:${face.subset === "latin" ? LATIN_RANGE : LATIN_EXT_RANGE};}`);
    }
  }
  return rules.join("\n");
}

// Pairings give the model and the brand panel tested heading/body combinations.
export const DESIGN_FONT_PAIRINGS = [
  { id: "swiss", name: "Swiss modern", heading: "Inter", body: "Inter", mood: "Neutral, precise, grid-led" },
  { id: "tech", name: "Technical", heading: "Space Grotesk", body: "JetBrains Mono", mood: "Developer tools, data, engineering" },
  { id: "editorial", name: "Editorial", heading: "Instrument Serif", body: "Inter", mood: "Premium, literary, calm confidence" },
  { id: "warm-serif", name: "Warm serif", heading: "Fraunces", body: "DM Sans", mood: "Friendly, crafted, human" },
  { id: "luxury", name: "Luxury", heading: "Bodoni Moda", body: "Manrope", mood: "Fashion, high contrast, refined" },
  { id: "poster", name: "Poster bold", heading: "Anton", body: "Archivo", mood: "Loud, condensed, sports and events" },
  { id: "condensed", name: "Condensed display", heading: "Bebas Neue", body: "Space Grotesk", mood: "Announcements, headlines, urgency" },
  { id: "experimental", name: "Experimental", heading: "Syne", body: "Manrope", mood: "Art-school, unexpected, creative tools" },
  { id: "geometric", name: "Wide geometric", heading: "Unbounded", body: "Plus Jakarta Sans", mood: "Web3, futuristic, playful tech" },
  { id: "grotesque", name: "Characterful grotesque", heading: "Bricolage Grotesque", body: "Inter", mood: "Indie product, quirky, modern" },
  { id: "newsroom", name: "Newsroom", heading: "Playfair Display", body: "Newsreader", mood: "Announcements, journalism, trust" },
  { id: "industrial", name: "Industrial", heading: "Big Shoulders Display", body: "Space Mono", mood: "Hardware, infrastructure, raw" },
  { id: "startup", name: "Startup clean", heading: "Sora", body: "DM Sans", mood: "SaaS, approachable, polished" },
] as const satisfies ReadonlyArray<{ id: string; name: string; heading: DesignFontFamily; body: DesignFontFamily; mood: string }>;
