import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import sharp from "sharp";
import { designDocumentSchema, renderDesignHtml, type DesignDocument } from "@/lib/design-studio/document";
import { designFont, designFontFaceCss } from "@/lib/design-studio/fonts";

export type RenderIssue = { pageId: string; nodeId?: string; code: string; severity: "error" | "warning"; message: string; suggestedFontSize?: number; suggestedFill?: string };
type RenderOptions = { scale?: 1 | 2; signal?: AbortSignal; watermark?: boolean };
type RenderResult = { png: Uint8Array; width: number; height: number; issues: RenderIssue[] };
const MAX_PIXELS = 20_000_000;
const TIMEOUT_MS = 25_000;
let active = 0;
const waiting: Array<() => void> = [];
let fontCss: Promise<string> | undefined;

function checkCancellation(signal: AbortSignal) {
  if (signal.aborted) throw new Error("Design rendering was cancelled or timed out.");
}

async function acquire(signal: AbortSignal): Promise<() => void> {
  checkCancellation(signal);
  if (active >= 2) {
    if (waiting.length >= 8) throw new Error("The design renderer is busy. Please retry shortly.");
    await new Promise<void>((resolve, reject) => {
      const ready = () => { signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(new Error("Design rendering was cancelled or timed out."));
      };
      waiting.push(ready);
      signal.addEventListener("abort", abort, { once: true });
    });
  } else active++;
  // A released slot is reserved for the next waiter before it resumes.
  return () => { const next = waiting.shift(); if (next) next(); else active--; };
}

function getOutfitCss(): Promise<string> {
  fontCss ??= Promise.all(["outfit-latin.woff2", "outfit-latin-ext.woff2"].map(async (file) => {
    const bytes = await readFile(path.join(process.cwd(), "src", "app", "fonts", file));
    const range = file.includes("-ext") ? "unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;" : "";
    return `@font-face{font-family:Outfit;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');font-weight:100 900;font-style:normal;font-display:block;${range}}`;
  })).then((rules) => rules.join("\n")).catch((error) => { fontCss = undefined; throw error; });
  return fontCss;
}

const fontFiles = new Map<string, Promise<string>>();
function fontDataUrl(file: string) {
  let data = fontFiles.get(file);
  if (!data) {
    data = readFile(path.join(process.cwd(), "public", "design-fonts", file)).then((bytes) => `data:font/woff2;base64,${bytes.toString("base64")}`);
    data.catch(() => fontFiles.delete(file));
    fontFiles.set(file, data);
  }
  return data;
}

// Embeds Outfit plus only the catalog families a document actually uses.
export async function getDesignFontCss(document?: DesignDocument): Promise<string> {
  const outfit = await getOutfitCss();
  if (!document) return outfit;
  const families = new Set<string>([document.brand.headingFont, document.brand.bodyFont, ...document.pages.flatMap((page) => page.nodes.filter((node) => node.type === "text").map((node) => node.fontFamily))]);
  const files = [...families].flatMap((family) => designFont(family).faces.map((face) => face.file));
  const urls = new Map(await Promise.all(files.map(async (file) => [file, await fontDataUrl(file)] as const)));
  return `${outfit}\n${designFontFaceCss(families, (file) => urls.get(file)!)}`;
}

function browserConfig(): { executablePath: string } | { endpoint: string } {
  const executablePath = process.env.DESIGN_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (executablePath) return { executablePath };
  let endpoint = process.env.DESIGN_BROWSER_CDP_URL?.trim();
  if (!endpoint && process.env.BROWSERLESS_API_URL && process.env.BROWSERLESS_API_KEY) {
    const url = new URL(process.env.BROWSERLESS_API_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/(screenshot|function|content)\/?$/, "").replace(/\/$/, "")}/`;
    url.searchParams.set("token", process.env.BROWSERLESS_API_KEY);
    endpoint = url.toString();
  }
  if (!endpoint) throw new Error("The isolated design renderer is not configured. Set DESIGN_CHROMIUM_EXECUTABLE_PATH or DESIGN_BROWSER_CDP_URL.");
  const parsed = new URL(endpoint);
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) throw new Error("The design browser endpoint must use HTTP or WebSocket.");
  return { endpoint };
}

async function validateAssets(document: DesignDocument) {
  let total = 0;
  for (const asset of document.assets) {
    const bytes = Buffer.from(asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1), "base64");
    total += bytes.byteLength;
    if (total > 12_000_000) throw new Error("The design assets exceed the size limit.");
    // Inspect signatures before handing bytes to a browser decoder. SVG/HTML
    // mislabeled as a raster must never reach Chromium, even inside data: URLs.
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (!png && !jpeg && !webp) {
      if (/^\s*</.test(bytes.toString("utf8", 0, 256))) throw new Error("Only approved raster images may be rendered.");
      // Corrupt binary assets remain visible as missing_asset diagnostics.
      continue;
    }
    try {
      const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: true }).metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) > 1) throw new Error("Asset pixel limit exceeded.");
    } catch (error) {
      if (error instanceof Error && /pixel|pages|limit/i.test(error.message)) throw new Error("An image exceeds the raster pixel limit.");
    }
  }
}

export async function renderDesignPage(input: DesignDocument, pageId: string, options: RenderOptions = {}): Promise<RenderResult> {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  checkCancellation(signal);
  const design = designDocumentSchema.parse(input);
  const designPage = design.pages.find((page) => page.id === pageId);
  if (!designPage) throw new Error("Design page not found.");
  const scale = options.scale ?? 1;
  if (scale !== 1 && scale !== 2) throw new Error("The renderer supports scale 1 or 2.");
  const width = designPage.width * scale;
  const height = designPage.height * scale;
  if (width * height > MAX_PIXELS) throw new Error("The rendered image exceeds the output pixel limit.");
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let release: (() => void) | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let stage = "input validation";
  const closeOnAbort = () => { void context?.close().catch(() => {}); void browser?.close().catch(() => {}); };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    release = await acquire(signal);
    await validateAssets(design);
    const config = browserConfig();
    const css = await getDesignFontCss(design);
    checkCancellation(signal);
    stage = "browser connection";
    try {
      browser = "executablePath" in config
        ? await chromium.launch({ executablePath: config.executablePath, headless: true, chromiumSandbox: true, timeout: 10_000, args: ["--disable-background-networking", "--disable-component-update", "--disable-domain-reliability", "--disable-sync", "--disable-extensions", "--no-first-run", "--host-resolver-rules=MAP * ~NOTFOUND"] })
        : await chromium.connectOverCDP(config.endpoint, { timeout: 10_000 });
    } catch { throw new Error("The isolated design browser could not start. Check its server configuration."); }
    checkCancellation(signal);
    stage = "context creation";
    context = await browser.newContext({ viewport: { width: designPage.width, height: designPage.height }, deviceScaleFactor: scale, javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false, offline: true, reducedMotion: "reduce", colorScheme: "light", locale: "en-US", timezoneId: "UTC" });
    checkCancellation(signal);
    context.setDefaultTimeout(10_000);
    const issues: RenderIssue[] = [];
    const add = (issue: Omit<RenderIssue, "pageId">) => { if (issues.length < 500) issues.push({ pageId, ...issue }); };
    await context.route("**/*", async (route) => { add({ code: "blocked_resource", severity: "error", message: "The renderer blocked an external resource request." }); await route.abort("blockedbyclient"); });
    await context.routeWebSocket("**/*", (socket) => { add({ code: "blocked_resource", severity: "error", message: "The renderer blocked a WebSocket connection." }); socket.close(); });
    const page = await context.newPage();
    page.on("download", (download) => { void download.cancel(); add({ code: "blocked_resource", severity: "error", message: "The renderer blocked a download." }); });
    page.on("pageerror", () => add({ code: "render_failure", severity: "error", message: "Chromium reported a page rendering error." }));
    stage = "markup loading";
    await page.setContent(renderDesignHtml(design, pageId, css, { watermark: options.watermark }), { waitUntil: "load", timeout: 10_000 });
    // Only this trusted program executes. Model output is data, never code.
    stage = "font and image decoding";
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => {})));
    });
    checkCancellation(signal);
    stage = "layout measurement";
    const measured = await page.evaluate(({ pageId, expectedIds, lockedIds, brandColors, width, height }) => {
      const issues: RenderIssue[] = [];
      const add = (code: string, message: string, nodeId?: string, severity: "error" | "warning" = "error", suggestedFontSize?: number) => { if (issues.length < 450) issues.push({ pageId, nodeId, code, severity, message, ...(suggestedFontSize === undefined ? {} : { suggestedFontSize }) }); };
      const canvas = document.getElementById("design-canvas");
      if (!canvas || canvas.children.length !== expectedIds.length) { add("markup_violation", "The rendered canvas does not match the validated layers."); return issues; }
      const allowed = new Set(["HTML", "HEAD", "META", "TITLE", "STYLE", "BODY", "MAIN", "DIV", "IMG", "svg", "path", "line"]);
      for (const element of document.querySelectorAll("*")) {
        if (!allowed.has(element.tagName) || [...element.attributes].some((attribute) => /^on/i.test(attribute.name))) add("markup_violation", "Unexpected executable or unsupported markup was found.");
      }
      const root = document.documentElement;
      if (root.scrollWidth > width + 1 || root.scrollHeight > height + 1 || window.scrollX || window.scrollY) add("document_scroll", "The rendered document scrolls beyond its canvas.");
      const outside = (rect: DOMRect) => rect.left < -1 || rect.top < -1 || rect.right > width + 1 || rect.bottom > height + 1;
      const text: Array<{ id: string; boxes: DOMRect[]; bounds: DOMRect }> = [];
      const measure = document.createElement("canvas").getContext("2d");
      const locked = new Set(lockedIds);
      const rgb = (value: string): number[] | null => {
        if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
        const match = /^rgba?\(([^)]+)\)$/.exec(value);
        if (!match) return null;
        const parts = match[1].split(",").map(Number);
        return parts.length === 3 || parts[3] === 1 ? parts.slice(0, 3) : null;
      };
      const luminance = (color: number[]) => color.map((value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (a: number[], b: number[]) => { const left = luminance(a), right = luminance(b); return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05); };
      // Infer a background only when every intersecting earlier layer is
      // unambiguous. Photos, paths, partial coverage and translucent layers
      // are left to screenshot vision rather than assigned a guessed color.
      const solidBackground = (element: HTMLElement, bounds: DOMRect) => {
        let background = rgb(getComputedStyle(canvas).backgroundColor);
        for (const layer of Array.from(canvas.children) as HTMLElement[]) {
          if (layer === element) break;
          const css = getComputedStyle(layer);
          if (css.display === "none" || Number(css.opacity) === 0) continue;
          const box = layer.getBoundingClientRect();
          if (box.right <= bounds.left || box.left >= bounds.right || box.bottom <= bounds.top || box.top >= bounds.bottom) continue;
          const fill = rgb(css.backgroundColor);
          const border = parseFloat(css.borderWidth) || 0;
          // Gradients, patterns, blur and blending have no single color; leave them to vision.
          if (css.backgroundImage !== "none" || css.filter !== "none" || css.mixBlendMode !== "normal") { background = null; continue; }
          if (layer.dataset.nodeType === "rect" && Number(css.opacity) === 1 && fill && css.transform === "matrix(1, 0, 0, 1, 0, 0)" && parseFloat(css.borderRadius) === 0 && box.left + border <= bounds.left && box.top + border <= bounds.top && box.right - border >= bounds.right && box.bottom - border >= bounds.bottom) background = fill;
          else if (layer.dataset.nodeType !== "rect" || fill || border > 0) background = null;
        }
        return background;
      };
      const measureInk = (element: HTMLElement, range: Range) => {
        const allBoxes = Array.from(range.getClientRects());
        if (measure) measure.font = getComputedStyle(element).font;
        const metrics = measure?.measureText(element.textContent!.replaceAll("\n", " "));
        // Range bounds include unused font ascent/descent. Use the same actual
        // line ink geometry for original diagnostics and every font-fit trial.
        const boxes = allBoxes.filter((rect) => rect.width > 0 && rect.height > 0).slice(0, 128).map((rect) => metrics
          ? new DOMRect(rect.x, rect.y + metrics.fontBoundingBoxAscent - metrics.actualBoundingBoxAscent, rect.width, metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent)
          : rect);
        const bounds = element.getBoundingClientRect();
        const overflow = allBoxes.length > 128 || boxes.some((rect) => rect.bottom > bounds.bottom + 1 || rect.top < bounds.top - 1 || rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
        return { boxes, overflow };
      };
      for (const nodeId of expectedIds) {
        const element = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
        if (!element) { add("markup_violation", "A validated layer is missing.", nodeId); continue; }
        const style = getComputedStyle(element);
        if (style.display === "none" || Number(style.opacity) === 0) continue;
        const bounds = element.getBoundingClientRect();
        if (outside(bounds)) add("canvas_violation", "The visible layer extends beyond the canvas and is clipped.", nodeId);
        if (element.dataset.nodeType === "image") {
          const image = element.querySelector("img");
          if (!image?.complete || !image.naturalWidth || !image.naturalHeight) add("missing_asset", "The approved image could not be decoded or rendered.", nodeId);
        }
        if (element.dataset.nodeType !== "text" || !element.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(element);
        const { boxes, overflow } = measureInk(element, range);
        if (boxes.length && Number(style.opacity) === 1 && style.mixBlendMode === "normal" && style.filter === "none") {
          const background = solidBackground(element, range.getBoundingClientRect());
          const foreground = rgb(style.color);
          const outline = rgb(style.webkitTextStrokeColor);
          const threshold = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.67 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
          if (background && foreground && contrast(foreground, background) < threshold && !(outline && parseFloat(style.webkitTextStrokeWidth) >= 1.5 && contrast(outline, background) >= threshold)) {
            const suggestedFill = !locked.has(nodeId) ? brandColors.filter((color) => { const parsed = rgb(color); return parsed && contrast(parsed, background) >= threshold; }).sort((a, b) => contrast(rgb(b)!, background) - contrast(rgb(a)!, background))[0] : undefined;
            issues.push({ pageId, nodeId, code: "low_contrast", severity: "error", message: "Text has insufficient contrast against its solid background.", ...(suggestedFill ? { suggestedFill } : {}) });
          }
        }
        if (overflow) {
          let suggestedFontSize: number | undefined;
          const originalFontSize = parseFloat(style.fontSize);
          if (measure && !locked.has(nodeId) && originalFontSize > 8) {
            const originalInlineSize = element.style.fontSize;
            try {
              element.style.fontSize = "8px";
              if (!measureInk(element, range).overflow) {
                // Wrapping makes fit non-monotonic: a larger size can fit
                // because a word moves to the next line while a smaller one
                // overflows, so a binary search can settle far below the
                // largest fit. Scan down from the authored size instead; the
                // schema caps fonts at 600px and each trial is one layout.
                // No guessed proportional scaling is returned.
                for (let candidate = Math.ceil(originalFontSize) - 1; candidate >= 8; candidate--) {
                  element.style.fontSize = `${candidate}px`;
                  if (!measureInk(element, range).overflow) { suggestedFontSize = candidate; break; }
                }
              }
            } finally {
              // Trials only supply diagnostics. The screenshot, overlap checks
              // and font verification must retain the authored typography.
              element.style.fontSize = originalInlineSize;
            }
          }
          add("text_overflow", "Text exceeds its layer bounds; increase the box or reduce the typography.", nodeId, "error", suggestedFontSize);
        }
        if (boxes.some(outside) && !outside(bounds)) add("text_clipping", "Text glyphs extend beyond the canvas and are clipped.", nodeId);
        const occluded = boxes.some((rect) => {
          const x = Math.max(0, Math.min(width - 1, rect.left + rect.width / 2));
          const y = Math.max(0, Math.min(height - 1, rect.top + rect.height / 2));
          const top = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-node-id]");
          if (!top || top === element || !["rect", "ellipse"].includes(top.dataset.nodeType || "")) return false;
          const cover = getComputedStyle(top);
          return Number(cover.opacity) === 1 && cover.mixBlendMode === "normal" && cover.backgroundColor !== "transparent" && !cover.backgroundColor.endsWith(", 0)");
        });
        if (occluded) add("text_occluded", "A later opaque shape covers this text. Review its layer order.", nodeId, "warning");
        text.push({ id: nodeId, boxes, bounds: range.getBoundingClientRect() });
      }
      const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right, width) - Math.max(a.left, b.left, 0) > 2 && Math.min(a.bottom, b.bottom, height) - Math.max(a.top, b.top, 0) > 2;
      for (let a = 0; a < text.length; a++) for (let b = a + 1; b < text.length; b++) {
        if (intersects(text[a].bounds, text[b].bounds) && text[a].boxes.some((left) => text[b].boxes.some((right) => intersects(left, right)))) add("text_overlap", `Text overlaps layer ${text[b].id}. Review the intentionality of this overlap.`, text[a].id, "warning");
      }
      return issues;
    }, { pageId, expectedIds: designPage.nodes.map((node) => node.id), lockedIds: designPage.nodes.filter((node) => node.locked).map((node) => node.id), brandColors: [design.brand.primary, design.brand.secondary, design.brand.background], width: designPage.width, height: designPage.height });
    issues.push(...measured);
    // Chromium's actual glyph fonts catch missing glyphs and silent system
    // substitution; computed font-family alone cannot establish this.
    stage = "glyph font verification";
    const session = await context.newCDPSession(page);
    try {
      await session.send("DOM.enable");
      await session.send("CSS.enable");
      const root = await session.send("DOM.getDocument");
      for (const node of designPage.nodes.filter((node) => node.type === "text" && node.visible && node.opacity > 0 && node.text.trim())) {
        const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.root.nodeId, selector: `[data-node-id="${node.id}"]` });
        const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
        if (!fonts.length || fonts.some((font) => font.glyphCount > 0 && !font.familyName.toLowerCase().includes(node.fontFamily.toLowerCase()))) add({ nodeId: node.id, code: "font_fallback", severity: "warning", message: `Some text glyphs use a fallback instead of ${node.fontFamily}.` });
      }
    } finally { await session.detach().catch(() => {}); }
    checkCancellation(signal);
    stage = "PNG capture";
    const png = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide", timeout: 10_000 });
    if (!png.byteLength || png.byteLength > 24_000_000) throw new Error("The rendered PNG exceeds the output size limit.");
    if (signal.aborted) throw new Error(`Design rendering was cancelled or timed out during ${stage}.`);
    return { png: new Uint8Array(png), width, height, issues };
  } catch (error) {
    if (signal.aborted) throw new Error(`Design rendering was cancelled or timed out during ${stage}.`);
    // Provider errors can contain CDP URLs with credentials. Never return them.
    if (browser && error instanceof Error) throw new Error(`Chromium could not render the design during ${stage}. Check the browser service and retry.`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", closeOnAbort);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    release?.();
  }
}

export async function renderDesignDocument(document: DesignDocument, options: RenderOptions = {}) {
  const validated = designDocumentSchema.parse(document);
  const pages: Array<RenderResult & { pageId: string }> = [];
  for (const page of validated.pages) pages.push({ pageId: page.id, ...await renderDesignPage(validated, page.id, options) });
  return pages;
}
