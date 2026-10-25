// The scanned look of a project, for recognisable project cards and pages.
export type ProjectBrandSummary = {
  tagline: string;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  accentColor: string | null;
};

function asHttpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function asHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

// logoUrl is left out on purpose: scans sometimes pick a customer logo from
// the page, while the favicon is always the site's own mark.
export function projectBrandSummary(profile: unknown): ProjectBrandSummary | null {
  const parsed = typeof profile === "string" ? JSON.parse(profile) as unknown : profile;
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const visual = record.visualSystem && typeof record.visualSystem === "object"
    ? record.visualSystem as Record<string, unknown>
    : {};
  const colors = Array.isArray(record.colors) ? record.colors : [];
  const brand = {
    tagline: typeof record.tagline === "string" ? record.tagline.replace(/\s+/g, " ").trim().slice(0, 160) : "",
    faviconUrl: asHttpsUrl(record.faviconUrl),
    coverImageUrl: asHttpsUrl(record.imageUrl),
    backgroundColor: asHexColor(visual.backgroundColor) ?? asHexColor(colors[0]),
    foregroundColor: asHexColor(visual.foregroundColor),
    accentColor: asHexColor(visual.accentColor) ?? asHexColor(colors[1]),
  };
  return Object.entries(brand).some(([, value]) => value) ? brand : null;
}
