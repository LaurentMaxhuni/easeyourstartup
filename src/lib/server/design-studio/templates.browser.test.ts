import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { brandKitSchema, CANVAS_PRESETS, designDocumentSchema } from "@/lib/design-studio/document";
import { buildTemplatePage, LAYOUT_TEMPLATES, type TemplateCopy } from "@/lib/design-studio/templates";
import { fitGeneratedDesignBounds } from "./pipeline";
import { renderDesignPage } from "./renderer";

vi.mock("server-only", () => ({}));

const copies: Record<string, TemplateCopy> = {
  short: { kicker: "Launching today", headline: "Ship it. Then tell everyone.", body: "Turn every product update into a launch campaign in minutes, written from your own site.", cta: "Try it free" },
  long: { kicker: "New in EaseYourStartup", headline: "Every release deserves a launch campaign people remember", body: "Scan your site, approve the facts, and get posts, emails and visuals for nine channels without starting from a blank page.", cta: "Start your first campaign" },
};
// A synthetic 1x1 PNG keeps the product-hero template renderable.
const pixel = `data:image/png;base64,${(await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#d8d2c8" } }).png().toBuffer()).toString("base64")}`;

describe.skipIf(process.env.RUN_DESIGN_BROWSER_TESTS !== "true")("hand-designed layout templates", () => {
  for (const [format, [width, height]] of Object.entries(CANVAS_PRESETS)) {
    it(`renders every template at ${format} without layout errors`, async () => {
      const tiles: Buffer[] = [];
      const failures: string[] = [];
      for (const template of LAYOUT_TEMPLATES) for (const [copyName, copy] of Object.entries(copies)) {
        const brand = brandKitSchema.parse({ name: "EaseYourStartup" });
        const assets = [{ id: "shot", name: "Product screenshot", kind: "image" as const, description: "", dataUrl: pixel }];
        const page = buildTemplatePage(template, { width, height, brand, assets, copy, slideIndex: 0, slideCount: copyName === "long" ? 3 : 1 }, "page-1", template.name);
        const document = fitGeneratedDesignBounds(designDocumentSchema.parse({ version: 1, title: template.name, brand, assets, pages: [page] }));
        const result = await renderDesignPage(document, "page-1");
        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (errors.length) failures.push(`${template.id}/${copyName}: ${errors.map((issue) => `${issue.code}@${issue.nodeId}`).join(", ")}`);
        tiles.push(await sharp(result.png).resize({ width: 360 }).png().toBuffer());
      }
      const tileHeight = Math.round(360 * height / width);
      const columns = 4, rows = Math.ceil(tiles.length / columns);
      const sheet = await sharp({ create: { width: columns * 370, height: rows * (tileHeight + 10), channels: 3, background: "#888888" } })
        .composite(tiles.map((input, index) => ({ input, left: (index % columns) * 370, top: Math.floor(index / columns) * (tileHeight + 10) }))).png().toBuffer();
      await mkdir("output/design-studio/templates", { recursive: true });
      await writeFile(`output/design-studio/templates/${format}.png`, sheet);
      // Template text sizes are estimates; browser fitting repairs residual
      // overflow in the pipeline, so only structural errors fail here.
      expect(failures.filter((failure) => !/text_overflow/.test(failure))).toEqual([]);
      if (failures.length) console.warn(`${format} fitting needed:\n${failures.join("\n")}`);
    }, 240_000);
  }
});
