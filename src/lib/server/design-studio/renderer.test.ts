import { mkdir, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { applyDesignPatch, designDocumentSchema, emptyDesignDocument } from "@/lib/design-studio/document";
import { renderDesignPage } from "./renderer";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

describe("design renderer input boundaries", () => {
  it("rejects remote image URLs before connecting to a browser", async () => {
    const doc = emptyDesignDocument();
    doc.assets = [{ id: "image", kind: "image", name: "Unsafe", description: "", dataUrl: "http://127.0.0.1/private" }];
    await expect(renderDesignPage(doc, "page-1")).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects SVG disguised as an approved PNG asset", async () => {
    const doc = emptyDesignDocument();
    doc.assets = [{ id: "image", kind: "image", name: "Unsafe", description: "", dataUrl: `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="http://127.0.0.1/private"/></svg>').toString("base64")}` }];
    await expect(renderDesignPage(doc, "page-1")).rejects.toThrow(/raster/i);
  });

  it("rejects an oversized output before starting Chromium", async () => {
    const doc = emptyDesignDocument();
    doc.pages[0].width = 4096;
    doc.pages[0].height = 4096;
    await expect(renderDesignPage(doc, "page-1", { scale: 2 })).rejects.toThrow(/pixel/i);
  });

  it("honors cancellation before allocating browser resources", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(renderDesignPage(emptyDesignDocument(), "page-1", { signal: controller.signal })).rejects.toThrow(/cancel/i);
  });

  it("rejects an unknown page", async () => {
    await expect(renderDesignPage(emptyDesignDocument(), "missing")).rejects.toThrow(/page/i);
  });

  it("requires explicit server browser configuration", async () => {
    for (const name of ["DESIGN_CHROMIUM_EXECUTABLE_PATH", "DESIGN_BROWSER_CDP_URL", "BROWSERLESS_API_URL", "BROWSERLESS_API_KEY"]) vi.stubEnv(name, "");
    await expect(renderDesignPage(emptyDesignDocument(), "page-1")).rejects.toThrow(/configured/i);
  });
});

describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("real isolated Chromium render", () => {
  it("checks solid backgrounds, suggests an approved brand color, and accounts for text outlines", async () => {
    const doc = designDocumentSchema.parse({ version: 1, title: "Contrast", brand: {}, pages: [{
      id: "page-1", name: "Contrast", width: 640, height: 640, background: "#f5f3ef", nodes: [
        { id: "low", type: "text", x: 40, y: 40, width: 560, height: 80, text: "Invisible headline", fontSize: 40, fill: "#ffffff" },
        { id: "panel", type: "rect", x: 0, y: 150, width: 640, height: 120, fill: "#181818" },
        { id: "reversed", type: "text", x: 40, y: 170, width: 560, height: 80, text: "Reversed headline", fontSize: 40, fill: "#ffffff" },
        { id: "outlined", type: "text", x: 40, y: 320, width: 560, height: 80, text: "Outlined headline", fontSize: 40, fill: "#ffffff", stroke: "#181818", strokeWidth: 2 },
      ],
    }] });
    const before = structuredClone(doc);
    const result = await renderDesignPage(doc, "page-1");
    expect(result.issues.filter((issue) => issue.code === "low_contrast")).toEqual([
      expect.objectContaining({ nodeId: "low", severity: "error", suggestedFill: "#181818" }),
    ]);
    expect(doc).toEqual(before);
    const repaired = await renderDesignPage(applyDesignPatch(doc, { explanation: "Use approved readable ink", patches: [{ pageId: "page-1", nodeId: "low", changes: { fill: "#181818" } }] }), "page-1");
    expect(repaired.issues.filter((issue) => issue.code === "low_contrast")).toEqual([]);
  }, 30000);

  it("suggests a measured CTA font size without changing the original document or screenshot", async () => {
    const doc = designDocumentSchema.parse({ version: 1, title: "Measured font fitting", brand: {}, assets: [], pages: [{
      id: "page-1", name: "CTA", width: 640, height: 640, background: "#f5f3ef", nodes: [
        { id: "cta", type: "text", role: "cta", x: 40, y: 40, width: 260, height: 32, text: "Start building your next great idea today", fontSize: 48, fontWeight: 700 },
      ],
    }] });
    const before = structuredClone(doc);
    const original = await renderDesignPage(doc, "page-1");
    const issue = original.issues.find((item) => item.code === "text_overflow" && item.nodeId === "cta");
    expect(issue).toMatchObject({ suggestedFontSize: expect.any(Number) });
    const suggestedFontSize = issue!.suggestedFontSize!;
    expect(suggestedFontSize).toBeGreaterThanOrEqual(8);
    expect(suggestedFontSize).toBeLessThan(48);
    expect(doc).toEqual(before);
    const locked = structuredClone(doc);
    locked.pages[0].nodes[0].locked = true;
    const withoutTrials = await renderDesignPage(locked, "page-1");
    expect(Buffer.from(original.png).equals(Buffer.from(withoutTrials.png))).toBe(true);
    expect(withoutTrials.issues.find((item) => item.code === "text_overflow")).not.toHaveProperty("suggestedFontSize");
    const patched = applyDesignPatch(doc, { explanation: "Apply measured typography fit", patches: [{ pageId: "page-1", nodeId: "cta", changes: { fontSize: suggestedFontSize } }] });
    const repaired = await renderDesignPage(patched, "page-1");
    expect(repaired.issues.filter((item) => item.code === "text_overflow")).toEqual([]);
    expect(doc).toEqual(before);
    expect(patched.pages[0].nodes[0]).toEqual({ ...before.pages[0].nodes[0], fontSize: suggestedFontSize });
    await mkdir("output/design-studio", { recursive: true });
    await writeFile("output/design-studio/renderer-font-fit-before.png", original.png);
    await writeFile("output/design-studio/renderer-font-fit-after.png", repaired.png);
  }, 30_000);

  it("does not shrink readable tight headlines or suggest a size when 8px cannot fit", async () => {
    const doc = designDocumentSchema.parse({ version: 1, title: "Bounded font fitting", brand: {}, assets: [], pages: [{
      id: "page-1", name: "Typography", width: 640, height: 640, background: "#f5f3ef", nodes: [
        { id: "headline", type: "text", role: "headline", x: 40, y: 40, width: 560, height: 45, text: "BUILD SOMETHING", fontSize: 48, lineHeight: 0.9, fontWeight: 700 },
        { id: "impossible", type: "text", x: 40, y: 200, width: 1, height: 1, text: "Too many letters for this tiny box", fontSize: 32 },
      ],
    }] });
    const result = await renderDesignPage(doc, "page-1");
    expect(result.issues.filter((issue) => issue.nodeId === "headline" && issue.code === "text_overflow")).toEqual([]);
    expect(result.issues.find((issue) => issue.nodeId === "impossible" && issue.code === "text_overflow")).not.toHaveProperty("suggestedFontSize");
  }, 30_000);

  it("captures exact PNG dimensions and reports actual text clipping, overlaps and canvas violations", async () => {
    const doc = designDocumentSchema.parse({ version: 1, title: "Browser diagnostics", brand: {}, assets: [], pages: [{
      id: "page-1", name: "Diagnostics", width: 640, height: 640, background: "#f5f3ef", nodes: [
        { id: "overflow", type: "text", x: 30, y: 40, width: 260, height: 20, text: "This text wraps across several lines and cannot fit", fontSize: 48 },
        { id: "overlap", type: "text", x: 40, y: 45, width: 250, height: 70, text: "Overlapping", fontSize: 38 },
        { id: "outside", type: "rect", x: 600, y: 620, width: 90, height: 90 },
      ],
    }] });
    const result = await renderDesignPage(doc, "page-1", { scale: 2 });
    expect(await sharp(result.png).metadata()).toMatchObject({ format: "png", width: 1280, height: 1280 });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(1280);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "overflow", code: "text_overflow", severity: "error" }),
      expect.objectContaining({ code: "text_overlap" }),
      expect.objectContaining({ nodeId: "outside", code: "canvas_violation" }),
    ]));
    expect(result.issues.some((issue) => issue.code === "font_fallback")).toBe(false);
    await mkdir("output/design-studio", { recursive: true });
    await writeFile("output/design-studio/renderer-diagnostics.png", result.png);
  }, 30_000);

  it("renders escaped hostile markup as text without making network requests", async () => {
    const doc = emptyDesignDocument();
    doc.pages[0].nodes[0].text = '<img src="http://127.0.0.1/private" onerror="fetch(\'https://example.com\')"><script>new WebSocket("ws://localhost")</script>';
    const result = await renderDesignPage(doc, "page-1");
    expect(result.png.byteLength).toBeGreaterThan(1000);
    expect(result.issues.some((issue) => ["markup_violation", "blocked_resource", "render_failure"].includes(issue.code))).toBe(false);
    await writeFile("output/design-studio/renderer-escaped-markup.png", result.png);
  }, 30_000);

  it("detects an undecodable raster instead of claiming the asset rendered", async () => {
    const doc = emptyDesignDocument();
    doc.assets = [{ id: "broken", kind: "image", name: "Broken", description: "", dataUrl: "data:image/png;base64,aW52YWxpZA==" }];
    doc.pages[0].nodes[0].type = "image";
    doc.pages[0].nodes[0].assetId = "broken";
    const result = await renderDesignPage(doc, "page-1");
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: "headline", code: "missing_asset", severity: "error" }));
  }, 30_000);

  it("reports text hidden behind a later opaque shape and actual unsupported glyph fonts", async () => {
    const doc = designDocumentSchema.parse({ version: 1, title: "Occlusion diagnostics", brand: {}, assets: [], pages: [{
      id: "page-1", name: "Occlusion", width: 640, height: 640, background: "#f5f3ef", nodes: [
        { id: "hidden", type: "text", x: 30, y: 40, width: 300, height: 60, text: "Hidden message", fontSize: 32 },
        { id: "cover", type: "rect", x: 20, y: 30, width: 360, height: 100, fill: "#f05228" },
        { id: "emoji", type: "text", x: 30, y: 200, width: 300, height: 70, text: "Launch 🚀", fontSize: 32 },
      ],
    }] });
    const result = await renderDesignPage(doc, "page-1");
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: "hidden", code: "text_occluded", severity: "warning" }));
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: "emoji", code: "font_fallback", severity: "warning" }));
  }, 30_000);

  it("renders approved raster data and recovers a render slot after cancellation", async () => {
    const controller = new AbortController();
    const cancelled = renderDesignPage(emptyDesignDocument(), "page-1", { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toThrow(/cancel/i);
    const doc = emptyDesignDocument();
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#f05228" } }).png().toBuffer();
    doc.assets = [{ id: "approved", name: "Approved image", kind: "image", description: "", dataUrl: `data:image/png;base64,${image.toString("base64")}` }];
    doc.pages[0].nodes[0].type = "image";
    doc.pages[0].nodes[0].assetId = "approved";
    const result = await renderDesignPage(doc, "page-1");
    expect(result.issues).toEqual([]);
    expect(await sharp(result.png).metadata()).toMatchObject({ width: 1080, height: 1350 });
  }, 30_000);
});
