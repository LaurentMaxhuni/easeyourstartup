import "server-only";

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
