import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { campaignTemplateCatalog, campaignTemplateConcepts } from "@/lib/design-studio/campaign-templates";
import { renderDesignPage } from "./renderer";

vi.mock("server-only", () => ({}));

describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("instant campaign template rendering", () => {
  it("renders technical, restrained, playful, and long-copy previews without layout errors", async () => {
    const tiles: Buffer[] = [];
    const failures: string[] = [];
    const diagnostics: string[] = [];
    const brands = [
      { name: "Stackline", voice: ["Technical", "Engineered"], colors: ["#f6fbf8", "#72e6b1", "#101827"], fonts: ["JetBrains Mono", "Inter"], message: "Deploy from your terminal. The new CLI is available today.", fullCatalog: false },
      { name: "Forma", voice: ["Premium", "Restrained", "Calm"], colors: ["#f7f4ee", "#92372e", "#27211d"], fonts: ["Fraunces", "Inter"], message: "A little more room to create. Introducing shared collections for your studio.", fullCatalog: false },
      { name: "Heyday", voice: ["Playful", "Bold", "Energetic"], colors: ["#fffae9", "#b13750", "#241d2b"], fonts: ["Outfit"], message: "Make room for good ideas. Your team can now share a board.", fullCatalog: true },
      { name: "Project workspace", voice: ["Clear"], colors: ["#ffffff", "#2158bb", "#192334"], fonts: ["'Inter Variable', Arial, sans-serif"], message: "A new way to bring every project update into a single shared workspace, with the details your team needs to keep moving. " + "View the update in your existing workspace. ".repeat(10), fullCatalog: true },
    ];
    for (const fixture of brands) {
      const input: Parameters<typeof campaignTemplateConcepts>[0] = {
        brand: { ...DEMO_BRAND, projectName: fixture.name, voice: fixture.voice, colors: fixture.colors, fonts: fixture.fonts, visualSystem: undefined, brandIntelligence: undefined, audience: "Product teams" },
        draft: { kind: "launch", goal: "Announce the update", updateDetails: fixture.message, audience: "Product teams", launchDate: "", cta: "Explore the update", angle: DEMO_ANGLES[0], channels: ["linkedin"] },
      };
      const concepts = fixture.fullCatalog ? campaignTemplateCatalog(input) : campaignTemplateConcepts(input);
      for (const concept of concepts) {
        expect(concept.document.brand.primary).toBe(fixture.colors[1]);
        expect(concept.document.brand.background).toBe(fixture.colors[0]);
        expect(concept.document.brand.secondary).toBe(fixture.colors[2]);
        expect(concept.document.brand.headingFont).toBe(fixture.fonts[0].startsWith("'Inter") ? "Inter" : fixture.fonts[0]);
        const mappedFamilies = new Set([concept.document.brand.headingFont, concept.document.brand.bodyFont]);
        expect(concept.document.pages[0].nodes.filter((node) => node.type === "text").every((node) => mappedFamilies.has(node.fontFamily))).toBe(true);
        const result = await renderDesignPage(concept.document, "page-1");
        const issues = result.issues.map((issue) => `${issue.severity}:${issue.code}@${issue.nodeId}${issue.suggestedFontSize === undefined ? "" : ` suggestedFontSize=${issue.suggestedFontSize}`} ${issue.message}`);
        diagnostics.push(`${fixture.name}/${concept.id} fonts=${[...mappedFamilies].join(",")} colors=${fixture.colors.join(",")} issues=${issues.join(";") || "none"}`);
        failures.push(...result.issues.filter((issue) => issue.severity === "error").map((issue) => `${fixture.name}/${concept.id}: ${issue.code}@${issue.nodeId}${issue.suggestedFontSize === undefined ? "" : ` suggestedFontSize=${issue.suggestedFontSize}`} ${issue.message}`));
        tiles.push(await sharp(result.png).resize({ width: 360 }).png().toBuffer());
      }
    }
    await mkdir("output/instant-campaign-previews", { recursive: true });
    await writeFile("output/instant-campaign-previews/browser-render.log", `${diagnostics.join("\n")}\n`, "utf8");
    const sheet = await sharp({ create: { width: 1100, height: Math.ceil(tiles.length / 3) * 370, channels: 3, background: "#d9d9d9" } })
      .composite(tiles.map((input, index) => ({ input, left: (index % 3) * 370, top: Math.floor(index / 3) * 370 }))).png().toBuffer();
    await writeFile("output/instant-campaign-previews/template-gallery.png", sheet);
    expect(failures).toEqual([]);
  }, 120_000);
});
