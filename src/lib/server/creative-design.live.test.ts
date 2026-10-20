import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RenderComposition } from "@/components/render-composition";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { applyCreativeDesign } from "@/lib/studio/editor-state";

vi.mock("server-only", () => ({}));
import { createInitialCreativeCanvas, designCreativeComposition } from "./campaign-generator";

// Explicit opt-in: provider calls using public/synthetic fixtures, no database or usage writes.
describe.skipIf(process.env.RUN_LIVE_AI_TESTS !== "true")("live custom canvas", () => {
  beforeAll(() => {
    for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
    mkdirSync("output/custom-canvas", { recursive: true });
    const originalFetch = globalThis.fetch;
    let responseIndex = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).includes("/chat/completions")) {
        const payload = await response.clone().json();
        writeFileSync(`output/custom-canvas/provider-${++responseIndex}.json`, JSON.stringify(payload, null, 2));
      }
      return response;
    });
  });
  afterAll(() => vi.restoreAllMocks());

  it.each([
    { id: "campaign", name: "EaseYourStartup", headline: "Turn every ship into a campaign.", detail: "Turn a website and product update into channel-specific launch copy.", cta: "Build your launch campaign", colors: ["#245cf0", "#f4f3ef", "#171917"] },
    { id: "focus", name: "QuietHours", headline: "Make room for focused work.", detail: "Reserve focus blocks on your calendar and pause meeting requests during them.", cta: "Plan your focus time", colors: ["#f3eee5", "#263d32", "#c35b37"] },
  ])("designs an editable $id visual from its own brief", async (fixture) => {
    const brand = {
      ...DEMO_BRAND, projectName: fixture.name, tagline: fixture.headline, colors: fixture.colors,
      claims: [], visualSystem: { ...DEMO_BRAND.visualSystem!, backgroundColor: fixture.colors[0], foregroundColor: fixture.colors[1], accentColor: fixture.colors[2] },
    };
    const composition = createInitialCreativeCanvas({
      brand, kind: "launch", goal: fixture.detail, updateDetails: fixture.detail,
      audience: "Solo founders", launchDate: "", cta: fixture.cta, angle: DEMO_ANGLES[0], channels: ["linkedin"],
    }, fixture.headline);
    composition.text.subheadline = fixture.detail;
    const copyCandidates = [fixture.name, fixture.headline, fixture.detail, fixture.cta];
    const result = await designCreativeComposition({
      projectName: fixture.name, brand, context: fixture.detail, approvedFacts: [fixture.detail],
      copyCandidates, composition,
      instruction: "Create a bespoke visual concept for this announcement. Express the product's purpose through composition and purposeful imagery. Keep the supplied headline and CTA exact.",
    });
    const canvas = applyCreativeDesign(composition, result.design);
    writeFileSync(`output/custom-canvas/${fixture.id}.json`, JSON.stringify(canvas, null, 2));
    const markup = renderToStaticMarkup(createElement(RenderComposition, { composition: canvas }));
    writeFileSync(`output/custom-canvas/${fixture.id}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:Outfit,sans-serif}.h-full{height:100%}.w-full{width:100%}</style></head><body>${markup}</body></html>`);
    expect(result.design.elements.some((element) => element.textRole === "headline" && element.text === fixture.headline)).toBe(true);
    expect(result.design.elements.some((element) => element.textRole === "cta" && element.text === fixture.cta)).toBe(true);
    expect(result.design.elements.filter((element) => element.kind === "text").every((element) => copyCandidates.includes(element.text!))).toBe(true);
  }, 180_000);
});
