import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
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
      ["192.88.99.0", 24],
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
    const secondGroup = Number.parseInt(normalized.split(":")[1] || "0", 16);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      first < 0x2000 ||
      first > 0x3fff ||
      (first === 0x2001 && secondGroup <= 0x01ff) ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("2001:2:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2002:") ||
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

  const hostname = normalizeHostname(url.hostname);
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

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

async function resolvePublicAddresses(url: URL) {
  const hostname = normalizeHostname(url.hostname);
  const family = isIP(hostname);
  if (family) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error("Private and reserved IP addresses are not supported.");
    }
    return [{ address: hostname, family }];
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("The website host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error("The website resolves to a private destination.");
  }
  return addresses;
}

export async function assertPublicHttpUrl(value: string) {
  const url = parsePublicHttpUrl(value);
  await resolvePublicAddresses(url);
  return url;
}

async function fetchPinnedPublicUrl(url: URL, init: RequestInit) {
  const hostname = normalizeHostname(url.hostname);
  const addresses = await resolvePublicAddresses(url);
  const dispatcher = new Agent({
    connect: {
      lookup(requestedHostname, options, callback) {
        if (normalizeHostname(requestedHostname) !== hostname) {
          const error = Object.assign(new Error("Unexpected request host."), { code: "ENOTFOUND" });
          if (options.all) callback(error, []);
          else callback(error, "", 0);
          return;
        }
        const matching = options.family
          ? addresses.filter((address) => address.family === options.family)
          : addresses;
        if (options.all) {
          callback(null, matching);
          return;
        }
        const selected = matching[0];
        if (!selected) {
          const error = Object.assign(new Error("No validated address for the request host."), { code: "ENOTFOUND" });
          callback(error, "", 0);
          return;
        }
        callback(null, selected.address, selected.family);
      },
    },
  });
  try {
    const response = await fetch(url, { ...init, dispatcher } as RequestInit);
    return { response, close: () => dispatcher.close() };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
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
  let current = parsePublicHttpUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let closeDispatcher: (() => Promise<void>) | null = null;
    try {
      let response: Response;
      try {
        const pinned = await fetchPinnedPublicUrl(current, {
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: accept,
            "User-Agent":
              "EaseYourStartupBot/0.1 (+https://easeyourstartup.com/bot)",
          },
        });
        response = pinned.response;
        closeDispatcher = pinned.close;
      } catch {
        throw new Error("The website did not respond in time.");
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) {
          throw new Error("The website redirected too many times.");
        }
        await response.body?.cancel().catch(() => undefined);
        await closeDispatcher?.();
        closeDispatcher = null;
        current = parsePublicHttpUrl(new URL(location, current).toString());
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
      await closeDispatcher?.();
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
  let current = parsePublicHttpUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let closeDispatcher: (() => Promise<void>) | null = null;
    try {
      let response: Response;
      try {
        const pinned = await fetchPinnedPublicUrl(current, {
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: Array.from(RASTER_IMAGE_TYPES).join(","),
            "User-Agent":
              "EaseYourStartupBot/0.1 (+https://easeyourstartup.com/bot)",
          },
        });
        response = pinned.response;
        closeDispatcher = pinned.close;
      } catch {
        throw new Error("The image did not respond in time.");
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxRedirects) {
          throw new Error("The image redirected too many times.");
        }
        await response.body?.cancel().catch(() => undefined);
        await closeDispatcher?.();
        closeDispatcher = null;
        current = parsePublicHttpUrl(new URL(location, current).toString());
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
      await closeDispatcher?.();
    }
  }

  throw new Error("The source image could not be loaded.");
}
