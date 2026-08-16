import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

const urlInputSchema = z.string().trim().min(1).max(2048);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function ipv4ToNumber(address: string) {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
}

function inIpv4Range(address: string, base: string, bits: number) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(base) & mask);
}

export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);

  if (version === 4) {
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return blockedRanges.some(([base, bits]) =>
      inIpv4Range(normalized, base, bits),
    );
  }

  if (version === 6) {
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      return isIP(mapped) === 4 ? isPrivateIpAddress(mapped) : true;
    }

    const firstGroup = normalized.split(":")[0] || "0";
    const first = Number.parseInt(firstGroup, 16);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") ||
      (first >= 0xfc00 && first <= 0xfdff) ||
      (first >= 0xfe80 && first <= 0xfebf) ||
      first >= 0xff00
    );
  }

  return true;
}

export function parsePublicHttpUrl(value: string) {
  const input = urlInputSchema.parse(value);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid public website URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not supported.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard web ports are supported.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Private and local destinations are not supported.");
  }
  if (isIP(hostname) && isPrivateIpAddress(hostname)) {
    throw new Error("Private and reserved IP addresses are not supported.");
  }

  url.hash = "";
  return url;
}

export async function assertPublicHttpUrl(value: string) {
  const url = parsePublicHttpUrl(value);
  const hostname = url.hostname;
  if (!isIP(hostname)) {
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new Error("The website host could not be resolved.");
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateIpAddress(address))
    ) {
      throw new Error("The website resolves to a private destination.");
    }
  }
  return url;
}

export async function safeFetchText(
  initialUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    acceptedContentTypes?: string[];
    accept?: string;
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const acceptedContentTypes = options.acceptedContentTypes ?? [
    "text/html",
    "application/xhtml+xml",
  ];
  const accept =
    options.accept ?? "text/html,application/xhtml+xml,text/css;q=0.8";
  let current = await assertPublicHttpUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(current, {
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: accept,
            "User-Agent":
              "EaseYourStartupBot/0.1 (+https://easeyourstartup.com/bot)",
          },
        });
      } catch {
        throw new Error("The website did not respond in time.");
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) {
          throw new Error("The website redirected too many times.");
        }
        current = await assertPublicHttpUrl(
          new URL(location, current).toString(),
        );
        continue;
      }

      if (!response.ok) {
        throw new Error(`The website returned HTTP ${response.status}.`);
      }

      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      if (
        !acceptedContentTypes.some((accepted) => contentType.includes(accepted))
      ) {
        throw new Error(
          acceptedContentTypes.includes("text/css")
            ? "The URL did not return a stylesheet."
            : "The URL did not return an HTML page.",
        );
      }

      const declaredLength = Number(
        response.headers.get("content-length") ?? "0",
      );
      if (declaredLength > maxBytes) {
        throw new Error("The page is too large to scan safely.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("The website returned an empty response.");
      const decoder = new TextDecoder();
      let total = 0;
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("The page is too large to scan safely.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return { text, finalUrl: current.toString(), contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("The website could not be scanned.");
}

export async function safeFetchHtml(
  initialUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
) {
  const result = await safeFetchText(initialUrl, options);
  return { html: result.text, finalUrl: result.finalUrl };
}

const RASTER_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function safeFetchImage(
  initialUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxBytes = options.maxBytes ?? 12_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let current = await assertPublicHttpUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(current, {
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: Array.from(RASTER_IMAGE_TYPES).join(","),
            "User-Agent":
              "EaseYourStartupBot/0.1 (+https://easeyourstartup.com/bot)",
          },
        });
      } catch {
        throw new Error("The image did not respond in time.");
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) {
          throw new Error("The image redirected too many times.");
        }
        current = await assertPublicHttpUrl(
          new URL(location, current).toString(),
        );
        continue;
      }

      if (!response.ok) {
        throw new Error(`The image returned HTTP ${response.status}.`);
      }

      const contentType =
        response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ??
        "";
      if (!RASTER_IMAGE_TYPES.has(contentType)) {
        throw new Error("The source did not return a supported image.");
      }

      const declaredLength = Number(
        response.headers.get("content-length") ?? "0",
      );
      if (declaredLength > maxBytes) {
        throw new Error("The source image is too large.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("The source image was empty.");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("The source image is too large.");
        }
        chunks.push(value);
      }

      const buffer = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { buffer: buffer.buffer, contentType };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("The source image could not be loaded.");
}
