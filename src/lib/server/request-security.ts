import "server-only";

export function assertSameOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? requestUrl.origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new Error("Cross-site request rejected.");
  }
  if (origin && origin !== configuredOrigin && origin !== requestUrl.origin) {
    throw new Error("Request origin rejected.");
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 64_000,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("Request body is too large.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Request body is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
