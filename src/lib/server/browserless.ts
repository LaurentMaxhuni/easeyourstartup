import "server-only";

import {
  assertPublicHttpUrl,
  isPrivateIpAddress,
  parsePublicHttpUrl,
} from "@/lib/server/url-security";

// Browserless accepts regex strings for rejecting requests made by the page.
// These cover local hostnames, private/reserved IPv4 literals, and all IPv6
// literals; the Browserless deployment must still deny non-public resolved
// addresses at its network boundary to cover DNS changes between checks/use.
const REJECT_PRIVATE_BROWSER_REQUESTS = [
  String.raw`/^https?:[/][/](?:localhost|[^/?#]+[.]localhost|metadata(?:[.]google[.]internal)?|instance-data|[^/?#]+[.](?:local|internal))(?::[0-9]+)?(?:[/?#]|$)/i`,
  /^https?:\/\/(?:\[[^\]]+\]|(?:0|10|127|22[4-9]|23[0-9]|24[0-9]|25[0-5])(?:\.[0-9]{1,3}){3}|169\.254(?:\.[0-9]{1,3}){2}|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2}|192\.(?:0\.(?:0|2)|88\.99|168)(?:\.[0-9]{1,3}){2}|198\.(?:18|19)(?:\.[0-9]{1,3}){2}|198\.51\.100\.[0-9]{1,3}|203\.0\.113\.[0-9]{1,3}|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])(?:\.[0-9]{1,3}){2})(?::[0-9]+)?(?:[/?#]|$)/i.toString(),
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
            waitUntil: "networkidle2",
            timeout: 15_000,
          },
          options: {
            type: "png",
            fullPage: true,
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

export async function captureCompositionPng(
  target: string,
  dimensions: { width: number; height: number },
) {
  if (
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 320 ||
    dimensions.height < 320 ||
    dimensions.width > 4096 ||
    dimensions.height > 4096
  ) {
    throw new Error("Export dimensions are not supported.");
  }
  const safeTarget = await assertPublicHttpUrl(target);
  const apiUrl = process.env.BROWSERLESS_API_URL;
  const token = process.env.BROWSERLESS_API_KEY;
  if (!apiUrl || !token) throw new Error("Server rendering is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
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
          gotoOptions: { waitUntil: "networkidle2", timeout: 35_000 },
          waitForFunction: {
            fn: "() => document.documentElement.dataset.renderReady === 'true'",
            timeout: 10_000,
          },
          options: { type: "png", fullPage: false, captureBeyondViewport: false },
          viewport: { ...dimensions, deviceScaleFactor: 1 },
        }),
      },
    );
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("image/png")) {
      throw new Error("The render service returned an invalid response.");
    }
    assertSafeBrowserlessResponse(response);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 24_000_000) {
      throw new Error("The rendered image exceeded the export limit.");
    }
    return new Uint8Array(bytes);
  } catch {
    throw new Error("The server could not render this campaign. Please retry.");
  } finally {
    clearTimeout(timeout);
  }
}
