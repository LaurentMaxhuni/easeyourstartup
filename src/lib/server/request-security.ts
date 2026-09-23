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
  const bytes = await readBoundedBody(request, maxBytes);
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("Invalid request size limit.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("Request body is too large.");
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
