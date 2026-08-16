import "server-only";

import { assertPublicHttpUrl } from "@/lib/server/url-security";

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
