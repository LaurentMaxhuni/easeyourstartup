import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  assertPublicHttpUrlMock,
  safeFetchHtmlMock,
  safeFetchTextMock,
} = vi.hoisted(() => ({
  assertPublicHttpUrlMock: vi.fn(async (value: string) => new URL(value)),
  safeFetchHtmlMock: vi.fn(),
  safeFetchTextMock: vi.fn(),
}));

vi.mock("@/lib/server/url-security", () => ({
  assertPublicHttpUrl: assertPublicHttpUrlMock,
  safeFetchHtml: safeFetchHtmlMock,
  safeFetchText: safeFetchTextMock,
}));

import { extractPage, scanWebsite } from "@/lib/server/scanner";

describe("website scanner extraction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    safeFetchTextMock.mockResolvedValue({ text: "", finalUrl: "" });
  });

  it("deduplicates colors before applying the palette limit", () => {
    const repeatedColor = Array.from({ length: 24 }, () => "#111111").join(" ");
    const page = extractPage(
      `<meta name="theme-color" content="#fefefe">
        <style>:root { --repeated: ${repeatedColor}; --blue: #245cf0; --green: #16a34a; }</style>`,
      "https://example.com/",
    );

    expect(page.colors).toContain("#245cf0");
    expect(page.colors).toContain("#16a34a");
  });

  it("extracts the source visual system signals", () => {
    const page = extractPage(
      `<style>
        :root { font-family: 'Source Sans 3', sans-serif; }
        .hero { background: linear-gradient(120deg, #102a43, #f4f1e8); border-radius: 14px; padding: 24px; gap: 12px; }
      </style>`,
      "https://example.com/",
    );

    expect(page.fonts).toContain("Source Sans 3");
    expect(page.radii).toContain(14);
    expect(page.spacings).toEqual(expect.arrayContaining([24, 12]));
    expect(page.usesGradient).toBe(true);
  });

  it("extracts the primary social image and responsive image sources", () => {
    const page = extractPage(
      `<meta property="og:image" content="/images/social-card.webp">
        <picture><source srcset="/images/hero-large.jpg 1200w, /images/hero.jpg 640w">
        <img src="/images/hero-small.jpg" alt="Product dashboard"></picture>`,
      "https://example.com/",
    );

    expect(page.imageUrl).toBe("https://example.com/images/social-card.webp");
  });

  it("includes colors from linked stylesheets in the live profile", async () => {
    safeFetchHtmlMock.mockResolvedValue({
      html: `<link rel="stylesheet" href="/assets/site.css"><h1>Launch platform</h1>`,
      finalUrl: "https://example.com/",
    });
    safeFetchTextMock.mockResolvedValue({
      text: ":root { --brand: #8b5cf6; --ink: rgb(23 25 23); } .hero { background-image: url('/images/hero.webp'); }",
      finalUrl: "https://example.com/assets/site.css",
    });

    const result = await scanWebsite("https://example.com");

    expect(result.profile.colors).toContain("#8b5cf6");
    expect(result.profile.colors).toContain("#171917");
    expect(result.profile.imageUrl).toBe(
      "https://example.com/images/hero.webp",
    );
    expect(result.profile.visualSystem).toMatchObject({
      radius: 8,
      spacing: 16,
      usesGradient: false,
    });
  });
});
