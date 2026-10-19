import "server-only";

import { load, type CheerioAPI } from "cheerio";
import { randomUUID } from "node:crypto";
import type {
  BrandClaim,
  BrandEvidenceItem,
  BrandFontAsset,
  BrandVisualSystem,
  ProductScreenshotCandidate,
  ScanResult,
  SourcePage,
} from "@/lib/contracts";
import {
  assertPublicHttpUrl,
  safeFetchHtml,
  safeFetchText,
} from "@/lib/server/url-security";

const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();
const MAX_PALETTE_COLORS = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(value: number) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function normalizeHexColor(value: string) {
  const match = value.trim().match(
    /^#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})$/,
  );
  if (!match) return null;
  const hex = match[1].slice(0, 6);
  const expanded =
    hex.length <= 4
      ? hex
          .slice(0, 3)
          .split("")
          .map((digit) => `${digit}${digit}`)
          .join("")
      : hex;
  return `#${expanded.toLowerCase()}`;
}

function parseRgbChannel(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return value.trim().endsWith("%") ? (parsed / 100) * 255 : parsed;
}

function normalizeRgbColor(value: string) {
  const body = value.slice(value.indexOf("(") + 1, -1);
  const channels = body.split(/[,\s/]+/).filter(Boolean).slice(0, 3);
  if (channels.length !== 3) return null;
  const parsed = channels.map(parseRgbChannel);
  if (parsed.some((channel) => channel === null)) return null;
  return `#${parsed.map((channel) => channelToHex(channel!)).join("")}`;
}

function normalizeHslColor(value: string) {
  const body = value.slice(value.indexOf("(") + 1, -1);
  const channels = body.split(/[,\s/]+/).filter(Boolean).slice(0, 3);
  if (
    channels.length !== 3 ||
    !channels[1].endsWith("%") ||
    !channels[2].endsWith("%")
  ) {
    return null;
  }
  const hue = Number.parseFloat(channels[0]);
  const saturation = Number.parseFloat(channels[1]) / 100;
  const lightness = Number.parseFloat(channels[2]) / 100;
  if (![hue, saturation, lightness].every(Number.isFinite)) return null;

  const h = ((hue % 360) + 360) / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h * 6) % 2) - 1));
  const match =
    h < 1 / 6
      ? [chroma, x, 0]
      : h < 2 / 6
        ? [x, chroma, 0]
        : h < 3 / 6
          ? [0, chroma, x]
          : h < 4 / 6
            ? [0, x, chroma]
            : h < 5 / 6
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const lightnessOffset = l - chroma / 2;
  return `#${match
    .map((channel) => channelToHex((channel + lightnessOffset) * 255))
    .join("")}`;
}

function extractColors(markup: string, themeColor?: string) {
  const colors: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.trim();
    const normalized =
      normalizeHexColor(trimmed) ??
      (/^rgba?\(/i.test(trimmed) ? normalizeRgbColor(trimmed) : null) ??
      (/^hsla?\(/i.test(trimmed) ? normalizeHslColor(trimmed) : null);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      colors.push(normalized);
    }
  };

  add(themeColor);
  for (const match of markup.match(
    /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g,
  ) ?? []) {
    add(match);
  }
  for (const match of markup.match(/rgba?\([^)]*\)/gi) ?? []) {
    add(match);
  }
  for (const match of markup.match(/hsla?\([^)]*\)/gi) ?? []) {
    add(match);
  }
  return colors;
}

function absoluteAssetUrl(value: string | null | undefined, base: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value, base);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function bestSrcsetSource(value: string | undefined) {
  if (!value) return null;
  return value
    .split(",")
    .map((candidate) => {
      const [source, descriptor] = candidate.trim().split(/\s+/);
      const score = descriptor?.endsWith("w")
        ? Number.parseInt(descriptor, 10)
        : descriptor?.endsWith("x")
          ? Number.parseFloat(descriptor) * 1_000
          : 0;
      return { source, score: Number.isFinite(score) ? score : 0 };
    })
    .filter(({ source }) => Boolean(source))
    .sort((left, right) => right.score - left.score)[0]?.source ?? null;
}

function imageSource($: CheerioAPI, element: unknown, base: string) {
  const node = $(element as never);
  const source =
    node.attr("src") ??
    node.attr("data-src") ??
    node.attr("data-lazy-src") ??
    node.attr("data-original") ??
    bestSrcsetSource(
      node.attr("srcset") ?? node.attr("data-srcset"),
    );
  return absoluteAssetUrl(source, base);
}

function extractCssImageUrl(markup: string, base: string) {
  for (const match of markup.matchAll(
    /(?:background(?:-image)?|mask(?:-image)?)\s*:[^;{}]*url\(\s*["']?([^"')]+)["']?\s*\)/gi,
  )) {
    const imageUrl = absoluteAssetUrl(match[1].trim(), base);
    if (imageUrl) return imageUrl;
  }
  return null;
}

const SAFE_FONT_FALLBACK = "Trebuchet MS";
const SAFE_HEADING_FALLBACK = "Georgia";

function cleanFontFamily(value: string) {
  const family = value
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .find((item) => {
      const normalized = item.toLowerCase();
      return (
        item &&
        /^[\p{L}\p{N} _-]+$/u.test(item) &&
        !/^(?:sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|cursive|fantasy)$/.test(
          normalized,
        )
      );
    });
  return family?.slice(0, 80) || null;
}

function extractFontFamilies(markup: string) {
  const fontMatches = markup.match(/font-family\s*:\s*([^;}]+)/gi) ?? [];
  return Array.from(
    new Set(
      fontMatches
        .map((match) => cleanFontFamily(match.split(":").slice(1).join(":")))
        .filter((font): font is string => Boolean(font)),
    ),
  ).slice(0, 6);
}

function extractFontAssets(
  markup: string,
  base: string,
): Array<Omit<BrandFontAsset, "url"> & { url: string }> {
  const assets = new Map<string, Omit<BrandFontAsset, "url"> & { url: string }>();
  for (const match of markup.matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
    const declarations = match[1];
    const familyValue = declarations.match(/font-family\s*:\s*([^;}]+)/i)?.[1];
    const family = familyValue ? cleanFontFamily(familyValue) : null;
    const source = declarations.match(/(?:^|;)\s*src\s*:\s*([^;}]+)/i)?.[1];
    if (!family || !source) continue;

    const rawWeight = declarations.match(/font-weight\s*:\s*([^;}]+)/i)?.[1]?.trim();
    const weight = rawWeight && /^(?:normal|bold|[1-9]00|[1-9]00\s+[1-9]00)$/i.test(rawWeight)
      ? rawWeight.toLowerCase()
      : "normal";
    const rawStyle = declarations.match(/font-style\s*:\s*([^;}]+)/i)?.[1]?.trim().toLowerCase();
    const style: BrandFontAsset["style"] =
      rawStyle && /^(?:normal|italic|oblique)$/.test(rawStyle)
        ? rawStyle as BrandFontAsset["style"]
        : "normal";
    const rawUnicodeRange = declarations.match(/unicode-range\s*:\s*([^;}]+)/i)?.[1]?.trim();
    const unicodeRange = rawUnicodeRange && /^[uU0-9a-fA-F?+,\s-]{1,400}$/.test(rawUnicodeRange)
      ? rawUnicodeRange
      : undefined;

    for (const sourceMatch of source.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
      const url = absoluteAssetUrl(sourceMatch[2].trim(), base);
      if (!url) continue;
      const asset = { family, weight, style, ...(unicodeRange ? { unicodeRange } : {}), url };
      assets.set(`${family.toLowerCase()}|${weight}|${style}|${unicodeRange ?? ""}|${url}`, asset);
    }
  }
  return Array.from(assets.values());
}

function limitFontAssets(assets: BrandFontAsset[], maximum: number) {
  const byFamily = new Map<string, BrandFontAsset[]>();
  for (const asset of assets) {
    const family = asset.family.toLowerCase();
    const group = byFamily.get(family);
    if (group) group.push(asset);
    else byFamily.set(family, [asset]);
  }
  const families = Array.from(byFamily.values());
  const limited: BrandFontAsset[] = [];
  while (limited.length < maximum) {
    let added = false;
    for (const family of families) {
      const asset = family.shift();
      if (!asset) continue;
      limited.push(asset);
      added = true;
      if (limited.length >= maximum) break;
    }
    if (!added) break;
  }
  return limited;
}

function extractCssLengths(markup: string, property: string) {
  const values: number[] = [];
  const declarationPattern = new RegExp(
    `${property}\\s*:\\s*([^;}]+)`,
    "gi",
  );
  for (const declaration of markup.matchAll(declarationPattern)) {
    for (const match of declaration[1].matchAll(/(-?\d+(?:\.\d+)?)(px|rem|em)\b/gi)) {
      const value = Number.parseFloat(match[1]);
      if (!Number.isFinite(value)) continue;
      const multiplier = match[2].toLowerCase() === "px" ? 1 : 16;
      values.push(Math.abs(value * multiplier));
    }
  }
  return values.filter((value) => value <= 96).slice(0, 24);
}

function colorLuminance(value: string) {
  const [red, green, blue] = value
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function colorSaturation(value: string) {
  const channels = value
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255);
  const highest = Math.max(...channels);
  const lowest = Math.min(...channels);
  return highest === 0 ? 0 : (highest - lowest) / highest;
}

function median(values: number[], fallback: number) {
  if (values.length === 0) return fallback;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? fallback;
}

function buildVisualSystem(
  colors: string[],
  fonts: string[],
  radii: number[],
  spacings: number[],
  usesGradient: boolean,
): BrandVisualSystem {
  const palette =
    colors.length > 0 ? colors : ["#f3f0e8", "#1b1b18", "#245cf0"];
  const background =
    palette.find((color) => colorLuminance(color) >= 0.78) ??
    palette.find((color) => colorLuminance(color) <= 0.18) ??
    palette[0];
  const backgroundLuminance = colorLuminance(background);
  const foreground =
    palette.find(
      (color) =>
        color !== background &&
        Math.abs(colorLuminance(color) - backgroundLuminance) >= 0.48,
    ) ?? (backgroundLuminance > 0.5 ? "#171917" : "#f4f1e8");
  const accent =
    [...palette]
      .filter((color) => color !== background && color !== foreground)
      .sort((left, right) => colorSaturation(right) - colorSaturation(left))[0] ??
    (backgroundLuminance > 0.5 ? "#245cf0" : "#f0b429");
  const radius = Math.round(clamp(median(radii, 8), 0, 24));
  const spacing = Math.round(clamp(median(spacings, 16), 6, 32));
  const density =
    spacing <= 10 ? "compact" : spacing >= 24 ? "airy" : "comfortable";
  const bodyFont = fonts[0] ?? SAFE_FONT_FALLBACK;
  const headingFont = fonts.length > 1 ? fonts[1] : fonts[0] ?? SAFE_HEADING_FALLBACK;

  return {
    backgroundColor: background,
    foregroundColor: foreground,
    accentColor: accent,
    radius,
    spacing,
    headingFont: headingFont.slice(0, 100),
    bodyFont: bodyFont.slice(0, 100),
    density,
    usesGradient,
  };
}

type ExtractedPage = {
  title: string;
  description: string;
  heading: string;
  excerpt: string;
  cta: string;
  internalLinks: string[];
  colors: string[];
  fonts: string[];
  radii: number[];
  spacings: number[];
  usesGradient: boolean;
  favicon: string | null;
  logo: string | null;
  imageUrl: string | null;
  stylesheetUrls: string[];
  fontAssets: Array<Omit<BrandFontAsset, "url"> & { url: string }>;
  pricingEvidence: BrandEvidenceItem[];
  testimonialEvidence: BrandEvidenceItem[];
  productScreenshotCandidates: Omit<ProductScreenshotCandidate, "sourceUrl">[];
};

export function extractPage(html: string, url: string): ExtractedPage {
  const paletteDocument = load(html);
  paletteDocument("script, noscript, template, iframe, object, embed").remove();
  const paletteMarkup = paletteDocument.html().slice(0, 300_000);

  const $ = load(html);
  $("script, style, noscript, template, iframe, object, embed").remove();

  const themeColor = $("meta[name=\"theme-color\"]").attr("content");
  const title = cleanText(
    $('meta[property="og:title"]').attr("content") ??
      $("title").first().text() ??
      new URL(url).hostname,
  ).slice(0, 240);
  const description = cleanText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  ).slice(0, 1200);
  const heading = cleanText($("h1").first().text()).slice(0, 500);
  const body = cleanText($("body").text()).slice(0, 20_000);
  const excerpt = description || heading || body.slice(0, 800);
  const evidenceFromText = (text: string): BrandEvidenceItem | null => {
    const cleaned = cleanText(text);
    if (!cleaned) return null;
    return {
      text: cleaned.slice(0, 400),
      sourceUrl: url,
      sourceExcerpt: cleaned.slice(0, 1200),
    };
  };
  const pricingSignal =
    /(?:[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:USD|EUR|GBP)\b|\b\d+(?:\.\d+)?\s?(?:\/|per\s+)(?:mo(?:nth)?|yr|year)\b|\bfree\s+(?:plan|trial|forever)\b)/i;
  const pricingEvidence = Array.from(
    new Set(
      $("[class], [id], [data-testid], h1, h2, h3, h4, p, li, span, strong")
        .toArray()
        .map((element) => cleanText($(element).text()))
        .filter((text) => text.length >= 6 && pricingSignal.test(text)),
    ),
  )
    .map(evidenceFromText)
    .filter((item): item is BrandEvidenceItem => Boolean(item))
    .slice(0, 8);
  const testimonialSignal = /(?:testimonial|review|customer[-_ ]quote)/i;
  const testimonialElements = $("blockquote, [class], [id], [data-testid]")
    .toArray()
    .filter((element) => {
      const attributes = [
        $(element).attr("class"),
        $(element).attr("id"),
        $(element).attr("data-testid"),
      ]
        .filter(Boolean)
        .join(" ");
      return element.tagName === "blockquote" || testimonialSignal.test(attributes);
    });
  const testimonialEvidence = Array.from(
    new Set(
      testimonialElements
        .map((element) => cleanText($(element).text()))
        .filter((text) => text.length >= 16),
    ),
  )
    .map(evidenceFromText)
    .filter((item): item is BrandEvidenceItem => Boolean(item))
    .slice(0, 8);
  const ctaCandidates = $("a, button").toArray().filter((element) => {
    const node = $(element);
    const text = cleanText(node.text());
    const href = node.attr("href") ?? "";
    return text.length >= 2 && text.length <= 80 &&
      !node.closest("nav, footer, [hidden], [aria-hidden='true']").length &&
      !/^#(?:main|content|skip)(?:[-_].*)?$/i.test(href) &&
      !/^(?:skip\b|(?:open|close|toggle) menu\b|(?:accept|reject|manage|allow)(?: all)? cookies\b|cookie (?:settings|preferences)\b)/i.test(text);
  });
  const ctaElement = ctaCandidates.find((element) => $(element).closest("main").length) ?? ctaCandidates[0];
  const cta = ctaElement ? cleanText($(ctaElement).text()) : "";

  const internalLinks = $("a[href]")
    .map((_, element) => {
      const href = $(element).attr("href");
      if (!href) return null;
      try {
        const link = new URL(href, url);
        const origin = new URL(url).origin;
        if (
          link.origin !== origin ||
          !["http:", "https:"].includes(link.protocol)
        ) {
          return null;
        }
        link.hash = "";
        return link.toString();
      } catch {
        return null;
      }
    })
    .get()
    .filter((value): value is string => Boolean(value));

  const colors = extractColors(paletteMarkup, themeColor).slice(
    0,
    MAX_PALETTE_COLORS,
  );
  const fonts = extractFontFamilies(paletteMarkup);
  const radii = extractCssLengths(paletteMarkup, "border-radius");
  const spacings = [
    ...extractCssLengths(paletteMarkup, "padding"),
    ...extractCssLengths(paletteMarkup, "gap"),
  ];

  const favicon =
    absoluteAssetUrl(
      $('link[rel~="icon"]').first().attr("href"),
      url,
    ) ?? absoluteAssetUrl("/favicon.ico", url);
  const logo =
    $(
      'img[src], img[srcset], img[data-src], img[data-lazy-src], img[data-original]',
    )
      .filter((_, element) => {
        const attributes = [
          $(element).attr("alt"),
          $(element).attr("class"),
          $(element).attr("id"),
        ]
          .filter(Boolean)
          .join(" ");
        return /logo/i.test(attributes);
      })
      .map((_, element) => imageSource($, element, url))
      .get()
      .find((value): value is string => Boolean(value)) ?? null;
  const socialImage = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('meta[property="twitter:image"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ]
    .map((value) => absoluteAssetUrl(value, url))
    .find((value): value is string => Boolean(value));
  const contentImage = $(
    'img[src], img[srcset], img[data-src], img[data-lazy-src], img[data-original], source[srcset]',
  )
    .map((_, element) => imageSource($, element, url))
    .get()
    .find((value): value is string => Boolean(value));
  const screenshotSignal =
    /(?:screenshot|dashboard|product[-_ ]?(?:screen|shot|ui)|app[-_ ]?(?:screen|preview)|interface|mockup|feature[-_ ]?screen)/i;
  const productScreenshotCandidates = $(
    'img[src], img[srcset], img[data-src], img[data-lazy-src], img[data-original], source[srcset]',
  )
    .map((_, element) => {
      const alt = cleanText($(element).attr("alt") ?? "").slice(0, 240);
      const attributes = [
        alt,
        $(element).attr("class"),
        $(element).attr("id"),
        $(element).attr("src"),
        $(element).attr("srcset"),
        $(element).attr("data-src"),
      ]
        .filter(Boolean)
        .join(" ");
      if (!screenshotSignal.test(attributes) || /\b(?:logo|avatar|icon)\b/i.test(attributes)) {
        return null;
      }
      const candidateUrl = imageSource($, element, url);
      return candidateUrl ? { url: candidateUrl, alt } : null;
    })
    .get()
    .filter(
      (candidate): candidate is Omit<ProductScreenshotCandidate, "sourceUrl"> =>
        Boolean(candidate),
    )
    .slice(0, 8);
  const imageUrl =
    socialImage ??
    contentImage ??
    extractCssImageUrl(paletteMarkup, url) ??
    logo;
  const stylesheetUrls = $(
    'link[rel~="stylesheet"][href], link[type="text/css"][href]',
  )
    .map((_, element) => absoluteAssetUrl($(element).attr("href"), url))
    .get()
    .filter((value): value is string => Boolean(value));

  return {
    title,
    description,
    heading,
    excerpt,
    cta,
    internalLinks,
    colors,
    fonts,
    radii,
    spacings,
    usesGradient: /(?:linear|radial|conic)-gradient\s*\(/i.test(paletteMarkup),
    favicon,
    logo,
    imageUrl,
    stylesheetUrls,
    fontAssets: extractFontAssets(paletteMarkup, url),
    pricingEvidence,
    testimonialEvidence,
    productScreenshotCandidates,
  };
}

function claimFromText(text: string, sourceUrl: string): BrandClaim | null {
  const cleaned = cleanText(text);
  if (cleaned.length < 16) return null;
  return {
    id: randomUUID(),
    text: cleaned.slice(0, 400),
    sourceUrl,
    sourceExcerpt: cleaned.slice(0, 1200),
    confidence: 0.82,
    approvalState: "approved",
  };
}

async function extractStylesheetAssets(urls: string[]) {
  const results = await Promise.allSettled(
    urls.slice(0, 8).map(async (stylesheetUrl) => {
      const result = await safeFetchText(stylesheetUrl, {
        timeoutMs: 4_000,
        maxBytes: 600_000,
        maxRedirects: 2,
        acceptedContentTypes: ["text/css"],
        accept: "text/css",
      });
      return {
        colors: extractColors(result.text),
        imageUrl: extractCssImageUrl(result.text, result.finalUrl),
        fonts: extractFontFamilies(result.text),
        fontAssets: extractFontAssets(result.text, result.finalUrl),
        radii: extractCssLengths(result.text, "border-radius"),
        spacings: [
          ...extractCssLengths(result.text, "padding"),
          ...extractCssLengths(result.text, "gap"),
        ],
        usesGradient: /(?:linear|radial|conic)-gradient\s*\(/i.test(result.text),
      };
    }),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

async function validateAssetUrl(value: string | null) {
  if (!value) return null;
  try {
    return (await assertPublicHttpUrl(value)).toString();
  } catch {
    return null;
  }
}

export async function scanWebsite(url: string): Promise<ScanResult> {
  const home = await safeFetchHtml(url);
  const homeData = extractPage(home.html, home.finalUrl);
  const pageUrls = Array.from(
    new Set(homeData.internalLinks.filter((link) => link !== home.finalUrl)),
  ).slice(0, 5);

  const secondary = await Promise.allSettled(
    pageUrls.map(async (pageUrl) => {
      const result = await safeFetchHtml(pageUrl, {
        timeoutMs: 6_000,
        maxBytes: 1_500_000,
        maxRedirects: 2,
      });
      return {
        url: result.finalUrl,
        data: extractPage(result.html, result.finalUrl),
      };
    }),
  );
  const stylesheetUrls = Array.from(
    new Set([
      ...homeData.stylesheetUrls,
      ...secondary.flatMap((result) =>
        result.status === "fulfilled" ? result.value.data.stylesheetUrls : [],
      ),
    ]),
  );
  const stylesheetAssets = await extractStylesheetAssets(stylesheetUrls);
  const colors = Array.from(
    new Set([
      ...homeData.colors,
      ...secondary.flatMap((result) =>
        result.status === "fulfilled" ? result.value.data.colors : [],
      ),
      ...stylesheetAssets.flatMap((asset) => asset.colors),
    ]),
  ).slice(0, MAX_PALETTE_COLORS);
  const fonts = Array.from(
    new Set([
      ...homeData.fonts,
      ...secondary.flatMap((result) =>
        result.status === "fulfilled" ? result.value.data.fonts : [],
      ),
      ...stylesheetAssets.flatMap((asset) => asset.fonts),
    ]),
  ).slice(0, 6);
  const radii = [
    ...homeData.radii,
    ...secondary.flatMap((result) =>
      result.status === "fulfilled" ? result.value.data.radii : [],
    ),
    ...stylesheetAssets.flatMap((asset) => asset.radii),
  ];
  const spacings = [
    ...homeData.spacings,
    ...secondary.flatMap((result) =>
      result.status === "fulfilled" ? result.value.data.spacings : [],
    ),
    ...stylesheetAssets.flatMap((asset) => asset.spacings),
  ];
  const usesGradient =
    homeData.usesGradient ||
    secondary.some(
      (result) => result.status === "fulfilled" && result.value.data.usesGradient,
    ) ||
    stylesheetAssets.some((asset) => asset.usesGradient);
  const [imageUrl, logoUrl, faviconUrl] = await Promise.all([
    validateAssetUrl(
      homeData.imageUrl ??
        stylesheetAssets.find((asset) => asset.imageUrl)?.imageUrl ??
        null,
    ),
    validateAssetUrl(homeData.logo),
    validateAssetUrl(homeData.favicon),
  ]);

  const pages: SourcePage[] = [
    {
      url: home.finalUrl,
      title: homeData.title,
      excerpt: homeData.excerpt,
    },
    ...secondary.flatMap((result) =>
      result.status === "fulfilled"
        ? [
            {
              url: result.value.url,
              title: result.value.data.title,
              excerpt: result.value.data.excerpt,
            },
          ]
        : [],
    ),
  ];
  const scannedPageData = [
    { url: home.finalUrl, data: homeData },
    ...secondary.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
  ];
  const fontAssetCandidates = Array.from(
    new Map(
      [
        ...scannedPageData.flatMap(({ data }) => data.fontAssets),
        ...stylesheetAssets.flatMap((asset) => asset.fontAssets),
      ].map((asset) => [
        `${asset.family.toLowerCase()}|${asset.weight}|${asset.style}|${asset.unicodeRange ?? ""}|${asset.url}`,
        asset,
      ] as const),
    ).values(),
  );
  const fontAssets = (
    await Promise.all(
      limitFontAssets(fontAssetCandidates as BrandFontAsset[], 24).map(async (asset) => {
        const url = await validateAssetUrl(asset.url);
        return url ? { ...asset, url } : null;
      }),
    )
  ).filter((asset): asset is BrandFontAsset => Boolean(asset));
  const collectEvidence = (key: "pricingEvidence" | "testimonialEvidence") => {
    const seen = new Set<string>();
    return scannedPageData
      .flatMap(({ data }) => data[key])
      .filter((item) => {
        const normalized = item.text.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 12);
  };
  const brandEvidence = {
    pricing: collectEvidence("pricingEvidence"),
    testimonials: collectEvidence("testimonialEvidence"),
  };
  const screenshotCandidates = Array.from(
    new Map(
      scannedPageData.flatMap(({ url: sourceUrl, data }) =>
        data.productScreenshotCandidates.map((candidate) => [
          candidate.url,
          { ...candidate, sourceUrl },
        ] as const),
      ),
    ).values(),
  ).slice(0, 24);
  const productScreenshotCandidates = (
    await Promise.all(
      screenshotCandidates.map(async (candidate) => {
        const candidateUrl = await validateAssetUrl(candidate.url);
        return candidateUrl ? { ...candidate, url: candidateUrl } : null;
      }),
    )
  )
    .filter((candidate): candidate is ProductScreenshotCandidate => Boolean(candidate))
    .slice(0, 16);

  const candidateClaims = [
    claimFromText(homeData.description, home.finalUrl),
    claimFromText(homeData.heading, home.finalUrl),
    ...secondary.flatMap((result) =>
      result.status === "fulfilled"
        ? [
            claimFromText(result.value.data.description, result.value.url),
            claimFromText(result.value.data.heading, result.value.url),
          ]
        : [],
    ),
  ].filter((claim): claim is BrandClaim => Boolean(claim));

  const fallbackColors = ["#f3f0e8", "#171917", "#245cf0"];
  const projectName =
    homeData.title.split(/[|:]/)[0]?.trim() || new URL(home.finalUrl).hostname;
  const failedPages = secondary.filter(
    (result) => result.status === "rejected",
  ).length;
  const proofPattern =
    /\b(testimonial|customer|trusted by|case study|review|rated|users?)\b/i;
  const hasProof = proofPattern.test(
    `${homeData.description} ${homeData.heading} ${pages
      .map((page) => page.excerpt)
      .join(" ")}`,
  );
  const hasClearPositioning =
    homeData.heading.length >= 18 && homeData.description.length >= 40;
  const hasCta = homeData.cta.length >= 3;
  const hasCapture = Boolean(process.env.BROWSERLESS_API_KEY);
  const hasImage = Boolean(imageUrl);
  const hasVisualAsset = hasCapture || hasImage;
  const visualSystem = buildVisualSystem(
    colors.length > 0 ? colors : fallbackColors,
    fonts,
    radii,
    spacings,
    usesGradient,
  );

  return {
    profile: {
      projectName: projectName.slice(0, 120),
      tagline: (homeData.heading || homeData.description).slice(0, 240),
      audience: `Customers described on ${new URL(home.finalUrl).hostname}`,
      voice: ["clear", "credible", "direct"],
      colors: colors.length > 0 ? colors : fallbackColors,
      fonts: fonts.length > 0 ? fonts : [visualSystem.bodyFont],
      fontAssets,
      cta: homeData.cta.slice(0, 120),
      claims: candidateClaims.slice(0, 30),
      logoUrl,
      faviconUrl,
      imageUrl,
      visualSystem,
      brandEvidence,
      productScreenshotCandidates,
    },
    pages,
    readiness: [
      {
        category: "missing_proof",
        severity: hasProof ? "good" : "action",
        title: hasProof ? "Proof signals found" : "Add customer proof",
        detail: hasProof
          ? "The scanned copy includes customer or credibility signals."
          : "Add a customer quote, concrete example, or trusted-by signal before launch.",
      },
      {
        category: "unclear_cta",
        severity: hasCta ? "good" : "action",
        title: hasCta ? "CTA found" : "Clarify the next step",
        detail: hasCta
          ? `The primary scanned action is “${homeData.cta}”.`
          : "Use one specific action that tells visitors what happens after they click.",
      },
      {
        category: "weak_positioning",
        severity: hasClearPositioning ? "good" : "watch",
        title: hasClearPositioning
          ? "Positioning is scannable"
          : "Tighten the positioning",
        detail: hasClearPositioning
          ? "The homepage has enough headline and description context for a launch story."
          : "State the audience, problem, and practical outcome more directly.",
      },
      {
        category: "screenshot_quality",
        severity: hasVisualAsset ? "good" : "action",
        title: hasCapture
          ? "Capture is ready"
          : hasImage
            ? "Website image found"
            : "Upload a clean product screen",
        detail: hasCapture
          ? "Desktop and mobile capture can feed the visual templates."
          : hasImage
            ? "The primary image from the public website will feed the visual templates."
            : "Use a high-resolution PNG, JPEG, or WebP without sensitive data.",
      },
    ],
    desktopCaptureUrl: hasCapture
      ? `/api/capture?target=${encodeURIComponent(home.finalUrl)}&viewport=desktop`
      : null,
    mobileCaptureUrl: hasCapture
      ? `/api/capture?target=${encodeURIComponent(home.finalUrl)}&viewport=mobile`
      : null,
    warnings: [
      ...(failedPages
        ? [`${failedPages} linked page${failedPages === 1 ? "" : "s"} could not be scanned.`]
        : []),
      ...(!hasCapture && !hasImage
        ? [
            "Live capture is unavailable and no usable website image was found. Upload a product screenshot to continue.",
          ]
        : []),
      "AI curation filtered duplicate and low-signal snippets before generation.",
    ],
    mode: "live",
  };
}
