import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { campaignTemplateConcepts } from "@/lib/design-studio/campaign-templates";
import { renderDesignPage } from "./renderer";

vi.mock("server-only", () => ({}));

describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("instant campaign template rendering", () => {
  it("renders technical, restrained, playful, and long-copy previews without layout errors", async () => {
    const tiles: Buffer[] = [];
    const failures: string[] = [];
    const brands = [
      { name: "Stackline", voice: ["Technical", "Engineered"], colors: ["#101827", "#72e6b1"], message: "Deploy from your terminal. The new CLI is available today." },
      { name: "Forma", voice: ["Premium", "Restrained", "Calm"], colors: ["#f7f4ee", "#92372e"], message: "A little more room to create. Introducing shared collections for your studio." },
      { name: "Heyday", voice: ["Playful", "Bold", "Energetic"], colors: ["#ffdc48", "#b13750"], message: "Make room for good ideas. Your team can now share a board." },
      { name: "Project workspace", voice: ["Clear"], colors: ["#ffffff", "#2158bb"], message: "A new way to bring every project update into a single shared workspace, with the details your team needs to keep moving. " + "View the update in your existing workspace. ".repeat(10) },
    ];
    for (const fixture of brands) {
      const concepts = campaignTemplateConcepts({
        brand: { ...DEMO_BRAND, projectName: fixture.name, voice: fixture.voice, colors: fixture.colors, fonts: [], visualSystem: undefined, brandIntelligence: undefined, audience: "Product teams" },
        draft: { kind: "launch", goal: "Announce the update", updateDetails: fixture.message, audience: "Product teams", launchDate: "", cta: "Explore the update", angle: DEMO_ANGLES[0], channels: ["linkedin"] },
      });
      for (const concept of concepts) {
        const result = await renderDesignPage(concept.document, "page-1");
        failures.push(...result.issues.filter((issue) => issue.severity === "error").map((issue) => `${fixture.name}/${concept.id}: ${issue.code}@${issue.nodeId}`));
        tiles.push(await sharp(result.png).resize({ width: 360 }).png().toBuffer());
      }
    }
    await mkdir("output/instant-campaign-previews", { recursive: true });
    const sheet = await sharp({ create: { width: 1100, height: brands.length * 370, channels: 3, background: "#d9d9d9" } })
      .composite(tiles.map((input, index) => ({ input, left: (index % 3) * 370, top: Math.floor(index / 3) * 370 }))).png().toBuffer();
    await writeFile("output/instant-campaign-previews/template-gallery.png", sheet);
    expect(failures).toEqual([]);
  }, 120_000);
});
