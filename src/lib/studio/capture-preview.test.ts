import { describe, expect, it } from "vitest";
import { capturePreviewUrl } from "./capture-preview";

describe("capturePreviewUrl", () => {
  it("requests a viewport capture while retaining the project and target", () => {
    const result = capturePreviewUrl("/api/capture?target=https%3A%2F%2Fexample.com%2F&viewport=desktop", "project-id");
    const url = new URL(result!, "https://example.invalid");
    expect(url.pathname).toBe("/api/capture");
    expect(url.searchParams.get("target")).toBe("https://example.com/");
    expect(url.searchParams.get("preview")).toBe("1");
    expect(url.searchParams.get("projectId")).toBe("project-id");
  });

  it("leaves other image sources alone and handles missing sources", () => {
    expect(capturePreviewUrl("/api/assets/asset-id", "project-id")).toBe("/api/assets/asset-id");
    expect(capturePreviewUrl(null, "project-id")).toBeNull();
  });
});
