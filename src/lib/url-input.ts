export function normalizePublicWebsiteUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(trimmed)?.[1].toLowerCase();
  const hostnamePort = /^[a-z\d.-]+:\d+(?:[/?#]|$)/i.test(trimmed);
  if (scheme && scheme !== "http" && scheme !== "https" && !hostnamePort) {
    return null;
  }

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
