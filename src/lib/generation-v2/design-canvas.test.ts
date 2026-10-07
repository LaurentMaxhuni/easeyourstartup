import { describe, expect, it } from "vitest";
import { campaignDesignPlanToCanvas } from "./design-canvas";
import { campaignDesignPlanSchema } from "./design-schema";
import { DEMO_BRAND, DEMO_COMPOSITION } from "@/lib/demo-data";

const plan = campaignDesignPlanSchema.parse({
  version: "1", brandAdaptation: { tone: "editorial", rationale: "Use the brand palette", theme: {
    background: "#ffffff", foreground: "#ffffff", accent: "#245cf0", headingFontFamily: "Outfit", bodyFontFamily: "Outfit", density: "comfortable", usesGradient: false,
  } }, components: [{ id: "cover", order: 0, kind: "cover", layoutVariant: "editorial", eyebrow: "Product update", headline: "A reviewed product announcement", supportingCopy: "The approved supporting copy.", body: "", cta: "Read more", footer: "", alignment: "left", emphasis: "headline", supportingClaimIds: [], screenshotRef: null }],
});

describe("reviewed campaign canvas", () => {
  it("keeps reviewed text, omits invented imagery, and corrects invisible foreground colors", () => {
    const design = campaignDesignPlanToCanvas(plan, DEMO_COMPOSITION, DEMO_BRAND);
    expect(design.theme.foreground).toBe("#000000");
    expect(design.elements.filter((element) => element.kind === "image")).toEqual([]);
    expect(design.elements.find((element) => element.textRole === "headline")?.text).toBe(plan.components[0].headline);
    expect(design.elements.every((element) => element.x + element.width <= 100 && element.y + element.height <= 100)).toBe(true);
  });
  it("scales long copy and keeps text zones separate", () => {
    const component = { ...plan.components[0], headline: "Long reviewed headline ".repeat(7).slice(0, 180), supportingCopy: "Supporting detail ".repeat(19).slice(0, 320), body: "Useful product context ".repeat(24).slice(0, 520) };
    const design = campaignDesignPlanToCanvas({ ...plan, components: [component] }, DEMO_COMPOSITION, DEMO_BRAND);
    const texts = design.elements.filter((element) => element.kind === "text");
    expect(texts.find((element) => element.textRole === "headline")?.fontSize).toBeLessThan(6.2);
    expect(texts.find((element) => element.textRole === "body")?.text).toBe(component.body);
    texts.forEach((element, index) => {
      for (const next of texts.slice(index + 1)) expect(element.y + element.height <= next.y || next.y + next.height <= element.y).toBe(true);
    });
  });
  it("resolves screenshots only from real supplied candidates", () => {
    const screenshotPlan = { ...plan, components: [{ ...plan.components[0], kind: "screenshot" as const, screenshotRef: "product-screenshot-1" }] };
    expect(() => campaignDesignPlanToCanvas(screenshotPlan, DEMO_COMPOSITION, DEMO_BRAND)).toThrow(/unavailable/);
    const brand = { ...DEMO_BRAND, productScreenshotCandidates: [{ url: "https://example.com/product.png", sourceUrl: "https://example.com", alt: "Real product" }] };
    const design = campaignDesignPlanToCanvas(screenshotPlan, DEMO_COMPOSITION, brand);
    expect(design.elements.find((element) => element.kind === "image")?.src).toBe("/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fproduct.png");
  });
});
