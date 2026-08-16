import { describe, expect, it } from "vitest";
import { toExportableImageUrl } from "@/lib/studio-export";

describe("studio export image sources", () => {
  it("proxies remote image URLs through the application origin", () => {
    expect(
      toExportableImageUrl(
        "https://cdn.example.com/product/hero.png?version=2",
        "/images/fallback.png",
      ),
    ).toBe(
      "/api/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Fproduct%2Fhero.png%3Fversion%3D2",
    );
  });

  it("keeps local and in-memory image sources unchanged", () => {
    expect(toExportableImageUrl("/api/capture?id=1", "/images/fallback.png")).toBe(
      "/api/capture?id=1",
    );
    expect(toExportableImageUrl("data:image/png;base64,abc", "/images/fallback.png")).toBe(
      "data:image/png;base64,abc",
    );
    expect(toExportableImageUrl(null, "/images/fallback.png")).toBe(
      "/images/fallback.png",
    );
  });
});
