import { describe, expect, it } from "vitest";
import { brandKitSchema } from "./document";
import { availableTemplates, buildTemplatePage, buildTemplateSlides, LAYOUT_TEMPLATES } from "./templates";

const copy = { kicker: "New", headline: "One‑click export", body: "Ship faster.", cta: "Try it" };
const context = { width: 1080, height: 1350, brand: brandKitSchema.parse({}), assets: [], copy, slideIndex: 0, slideCount: 1 };

describe("layout templates", () => {
  it("maps typographic hyphens and spaces to glyphs every bundled face has", () => {
    const page = buildTemplatePage(LAYOUT_TEMPLATES.find((template) => template.id === "tech-grid")!, context, "page-1", "Poster");
    expect(page.nodes.find((node) => node.id === "headline")?.text).toBe("One-click export");
    expect(page.nodes.find((node) => node.id === "body")?.text).toBe("Ship faster.");
  });
  it("draws CTA arrows instead of using a glyph missing from the Latin subsets", () => {
    const page = buildTemplatePage(LAYOUT_TEMPLATES.find((template) => template.id === "swiss-grid")!, context, "page-1", "Poster");
    expect(page.nodes.find((node) => node.id === "cta")?.text).toBe("Try it");
    expect(page.nodes.find((node) => node.id === "cta-arrow")?.type).toBe("path");
    expect(page.nodes.some((node) => node.text.includes("→"))).toBe(false);
  });
  it("uses explicit brand fonts, including Outfit, when campaign rendering requests them", () => {
    const brand = brandKitSchema.parse({ headingFont: "Outfit", bodyFont: "Outfit" });
    const page = buildTemplatePage(LAYOUT_TEMPLATES[0], { ...context, brand, useBrandFonts: true }, "page-1", "Campaign");
    expect(new Set(page.nodes.filter((node) => node.type === "text").map((node) => node.fontFamily))).toEqual(new Set(["Outfit"]));
  });
  it("gives every carousel slide the same headline size", () => {
    const slides = [{ ...copy, headline: "Turn every ship into a campaign" }, { ...copy, headline: "Editable layers, real fonts, your brand" }, { ...copy, headline: "Try it" }];
    const pages = buildTemplateSlides(LAYOUT_TEMPLATES[0], { width: 1080, height: 1350, brand: context.brand, assets: [] }, slides, (index) => `Slide ${index + 1}`);
    const sizes = pages.map((page) => page.nodes.find((node) => node.role === "headline")!.fontSize);
    expect(new Set(sizes).size).toBe(1);
    expect(pages.map((page) => page.id)).toEqual(["page-1", "page-2", "page-3"]);
  });
  it("keeps every layer inside the canvas and offers product hero only with an image", () => {
    for (const template of availableTemplates([])) for (const [width, height] of [[1080, 1350], [1080, 1920], [1920, 1080]]) {
      const page = buildTemplatePage(template, { ...context, width, height }, "page-1", "Poster");
      for (const node of page.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0); expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(width + 0.5); expect(node.y + node.height).toBeLessThanOrEqual(height + 0.5);
      }
    }
    expect(availableTemplates([]).some((template) => template.id === "product-hero")).toBe(false);
  });
});
