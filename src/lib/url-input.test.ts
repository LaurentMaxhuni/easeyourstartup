import { describe, expect, it } from "vitest";
import { normalizePublicWebsiteUrl } from "@/lib/url-input";

describe("public website URL normalization", () => {
  it("adds HTTPS to a hostname", () => {
    expect(normalizePublicWebsiteUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves HTTP and HTTPS URLs", () => {
    expect(normalizePublicWebsiteUrl("http://example.com/start")).toBe(
      "http://example.com/start",
    );
    expect(normalizePublicWebsiteUrl("https://example.com/start")).toBe(
      "https://example.com/start",
    );
  });

  it("rejects explicit non-HTTP schemes", () => {
    expect(normalizePublicWebsiteUrl("ftp://example.com")).toBeNull();
    expect(normalizePublicWebsiteUrl("mailto:founder@example.com")).toBeNull();
  });

  it("accepts a hostname with the default HTTPS port", () => {
    expect(normalizePublicWebsiteUrl("example.com:443")).toBe("https://example.com/");
  });
});
