import "server-only";

import { z } from "zod";
import {
  assertPublicHttpUrl,
  isPrivateIpAddress,
  parsePublicHttpUrl,
} from "@/lib/server/url-security";

// Browserless matches these strings with request.url().match(pattern), so use
// regex sources rather than /pattern/flags literals. Keep address ranges in
// short, unnested expressions: the combined filter made live captures fail.
// These cover local hostnames, private/reserved IPv4 literals, and all IPv6
// literals; the Browserless deployment must still deny non-public resolved
// addresses at its network boundary to cover DNS changes between checks/use.
const OCTET = String.raw`[0-9]{1,3}`;
const REJECT_PRIVATE_BROWSER_REQUESTS = [
  String.raw`^https?://(?:localhost|[^/?#]+\.localhost|metadata(?:\.google\.internal)?|instance-data|[^/?#]+\.(?:local|internal))(?::[0-9]+)?(?:[/?#]|$)`,
  String.raw`^https?://\[`,
  ...[
    String.raw`(?:0|10|127|22[4-9]|23[0-9]|24[0-9]|25[0-5])\.${OCTET}\.${OCTET}\.${OCTET}`,
    String.raw`169\.254\.${OCTET}\.${OCTET}`,
    String.raw`172\.(?:1[6-9]|2[0-9]|3[01])\.${OCTET}\.${OCTET}`,
    String.raw`192\.0\.(?:0|2)\.${OCTET}`,
    String.raw`192\.88\.99\.${OCTET}`,
    String.raw`192\.168\.${OCTET}\.${OCTET}`,
    String.raw`198\.(?:18|19)\.${OCTET}\.${OCTET}`,
    String.raw`198\.51\.100\.${OCTET}`,
    String.raw`203\.0\.113\.${OCTET}`,
    String.raw`100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.${OCTET}\.${OCTET}`,
  ].map((address) => String.raw`^https?://${address}(?::[0-9]+)?(?:[/?#]|$)`),
];

function assertSafeBrowserlessResponse(response: Response) {
  const finalUrl = response.headers.get("x-response-url");
  const remoteAddress = response.headers.get("x-response-ip")?.trim().replace(/^\[|\]$/g, "");
  if (!finalUrl || !remoteAddress) {
    throw new Error("The capture provider did not confirm its destination.");
  }
  parsePublicHttpUrl(finalUrl);
  if (isPrivateIpAddress(remoteAddress)) {
    throw new Error("The capture provider reached a private destination.");
  }
  const status = Number(response.headers.get("x-response-code"));
  if (Number.isFinite(status) && status > 0 && (status < 200 || status >= 400)) {
    throw new Error("The target website did not return a successful response.");
  }
}

export async function captureWebsite(
  target: string,
  viewport: "desktop" | "mobile",
  captureOptions: { fullPage?: boolean } = {},
) {
  const safeTarget = await assertPublicHttpUrl(target);
  const apiUrl = process.env.BROWSERLESS_API_URL;
  const token = process.env.BROWSERLESS_API_KEY;
  if (!apiUrl || !token) {
    throw new Error("Live capture is not configured.");
  }

  const dimensions =
    viewport === "mobile"
      ? { width: 390, height: 844, deviceScaleFactor: 2 }
      : { width: 1440, height: 1000, deviceScaleFactor: 1 };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/screenshot?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: safeTarget.toString(),
          rejectRequestPattern: REJECT_PRIVATE_BROWSER_REQUESTS,
          gotoOptions: {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          },
          // Let entrance animations settle without waiting on background
          // requests that a public site may leave loading indefinitely.
          waitForTimeout: 1_500,
          options: {
            type: "png",
            fullPage: captureOptions.fullPage ?? true,
            captureBeyondViewport: false,
          },
          viewport: dimensions,
        }),
      },
    );
    if (!response.ok) throw new Error("Browser capture failed.");
    assertSafeBrowserlessResponse(response);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("image/")) {
      throw new Error("Capture provider returned an invalid response.");
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 12_000_000) {
      throw new Error("Captured image exceeded the size limit.");
    }
    return { buffer, contentType };
  } catch {
    throw new Error("The website could not be captured.");
  } finally {
    clearTimeout(timeout);
  }
}

export const SCAN_PREVIEW_VIEWPORT = { width: 1440, height: 1000 } as const;

const scanPreviewElementSchema = z.object({
  kind: z.enum(["logo", "nav", "headline", "copy", "cta", "image"]),
  text: z.string().max(120),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

const scanPreviewDataSchema = z.object({
  url: z.string(),
  ip: z.string(),
  status: z.number(),
  image: z.string().min(1).max(8_000_000),
  title: z.string().max(200),
  elements: z.array(scanPreviewElementSchema).max(24),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).max(6),
  fonts: z.array(z.string().max(60)).max(3),
});

export type ScanPreviewElement = z.infer<typeof scanPreviewElementSchema>;
export type ScanPreview = Omit<z.infer<typeof scanPreviewDataSchema>, "url" | "ip" | "status">;

// Runs inside Browserless. It reports where the scanner's targets appear in
// the first viewport so the client can animate them over the screenshot.
// Page content stays data: only bounding boxes and short text are returned.
const SCAN_PREVIEW_FUNCTION = `export default async function ({ page, context }) {
  const blocked = context.rejectRequestPattern.map((pattern) => new RegExp(pattern));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (blocked.some((pattern) => pattern.test(request.url()))) request.abort();
    else request.continue();
  });
  await page.setViewport({ width: context.width, height: context.height, deviceScaleFactor: 1 });
  const response = await page.goto(context.url, { waitUntil: "domcontentloaded", timeout: 12000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const found = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const elements = [];
    const seen = new Set();
    const clean = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const label = (el) => clean(el.innerText || el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title")).slice(0, 120);
    const box = (el) => {
      if (!el || !el.getBoundingClientRect) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return null;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.1) return null;
      return r;
    };
    const add = (kind, el) => {
      if (!el || seen.has(el) || elements.length >= 24) return false;
      const r = box(el);
      if (!r) return false;
      seen.add(el);
      const x = Math.max(0, r.left), y = Math.max(0, r.top);
      elements.push({ kind, text: label(el), x: x / W, y: y / H, w: (Math.min(W, r.right) - x) / W, h: (Math.min(H, r.bottom) - y) / H });
      return true;
    };
    // Sites often skip <header>, so the top band of the viewport counts too.
    const header = document.querySelector("header, [role=banner]") || document.querySelector("nav");
    const inHeader = (el) => {
      if (header && header.contains(el)) return true;
      const r = el.getBoundingClientRect();
      return r.bottom <= H * 0.14;
    };
    const small = (el) => {
      const r = box(el);
      return r && r.width <= W * 0.3 && r.height <= H * 0.12 ? r : null;
    };
    const logoCandidates = [
      ...document.querySelectorAll("a[href='/'] img, a[href='/'] svg, [class*=logo i] img, [class*=logo i] svg, img[alt*=logo i], [class*=logo i], a[href='/']"),
      ...document.querySelectorAll("a, img, svg"),
    ].filter((el) => inHeader(el) && small(el));
    add("logo", logoCandidates.find((el) => el.getBoundingClientRect().left <= W * 0.3));
    let navCount = 0;
    for (const link of document.querySelectorAll("nav a, nav button, header a, header button, a, button")) {
      if (navCount >= 6 || !inHeader(link) || !small(link)) continue;
      const text = label(link);
      if (text.length < 2 || text.length > 24) continue;
      if (add("nav", link)) navCount += 1;
    }
    const headline = [...document.querySelectorAll("h1")].find(box) || [...document.querySelectorAll("h2")].find(box);
    add("headline", headline);
    const copy = [...document.querySelectorAll("main p, section p, header ~ * p, p, h2")]
      .find((el) => !inHeader(el) && box(el) && label(el).length >= 30);
    add("copy", copy);
    let ctaCount = 0;
    for (const el of document.querySelectorAll("a, button, [role=button]")) {
      if (ctaCount >= 2 || inHeader(el)) continue;
      const text = label(el);
      if (text.length < 2 || text.length > 40) continue;
      const style = getComputedStyle(el);
      const filled = style.backgroundColor && !/rgba\\(.*,\\s*0\\)$|transparent/.test(style.backgroundColor);
      const outlined = parseFloat(style.borderTopWidth) >= 1 && !/rgba\\(.*,\\s*0\\)$|transparent/.test(style.borderTopColor);
      if ((filled || outlined || /btn|button|cta/i.test(el.className || "")) && add("cta", el)) ctaCount += 1;
    }
    let imageCount = 0;
    for (const el of document.querySelectorAll("img, picture, video, canvas, svg")) {
      if (imageCount >= 3 || inHeader(el)) continue;
      const r = box(el);
      if (!r || (r.width * r.height) / (W * H) < 0.03) continue;
      if (add("image", el)) imageCount += 1;
    }
    const hex = (value) => {
      const match = (value || "").match(/rgba?\\(([\\d.]+)[ ,]+([\\d.]+)[ ,]+([\\d.]+)(?:[ ,/]+([\\d.]+))?/);
      if (!match || (match[4] !== undefined && Number(match[4]) < 0.5)) return null;
      return "#" + match.slice(1, 4).map((part) => Math.round(Number(part)).toString(16).padStart(2, "0")).join("");
    };
    const palette = [];
    const addColor = (value) => {
      const color = hex(value);
      if (color && !palette.includes(color) && palette.length < 6) palette.push(color);
    };
    addColor(getComputedStyle(document.body).backgroundColor);
    if (headline) addColor(getComputedStyle(headline).color);
    for (const el of seen) if (el.matches && el.matches("a, button, [role=button]")) addColor(getComputedStyle(el).backgroundColor);
    if (header) addColor(getComputedStyle(header).backgroundColor);
    const family = (el) => el ? clean(getComputedStyle(el).fontFamily.split(",")[0]).replace(/["']/g, "").slice(0, 60) : "";
    const fonts = [...new Set([family(headline), family(document.body)].filter(Boolean))];
    return { title: clean(document.title).slice(0, 200), elements, palette, fonts };
  });
  const image = await page.screenshot({ type: "jpeg", quality: 72, encoding: "base64" });
  return {
    data: {
      ...found,
      image,
      url: page.url(),
      ip: (response && response.remoteAddress() && response.remoteAddress().ip) || "",
      status: response ? response.status() : 0,
    },
    type: "application/json",
  };
}`;

export async function captureScanPreview(target: string): Promise<ScanPreview> {
  const safeTarget = await assertPublicHttpUrl(target);
  const apiUrl = process.env.BROWSERLESS_API_URL;
  const token = process.env.BROWSERLESS_API_KEY;
  if (!apiUrl || !token) {
    throw new Error("Live capture is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/function?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: SCAN_PREVIEW_FUNCTION,
          context: {
            url: safeTarget.toString(),
            rejectRequestPattern: REJECT_PRIVATE_BROWSER_REQUESTS,
            ...SCAN_PREVIEW_VIEWPORT,
          },
        }),
      },
    );
    if (!response.ok) throw new Error("Browser capture failed.");
    const body = (await response.json()) as { data?: unknown };
    const { url, ip, status, ...preview } = scanPreviewDataSchema.parse(body.data);
    parsePublicHttpUrl(url);
    if (!ip || isPrivateIpAddress(ip.replace(/^\[|\]$/g, ""))) {
      throw new Error("The capture provider reached a private destination.");
    }
    if (status < 200 || status >= 400) {
      throw new Error("The target website did not return a successful response.");
    }
    return preview;
  } catch {
    throw new Error("The website could not be captured.");
  } finally {
    clearTimeout(timeout);
  }
}
