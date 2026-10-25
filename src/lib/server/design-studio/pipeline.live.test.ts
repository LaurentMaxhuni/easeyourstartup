import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { brandKitSchema, renderDesignHtml } from "@/lib/design-studio/document";
import { generationInputSchema } from "@/lib/design-studio/workflow";
vi.mock("server-only", () => ({}));
import { runDesignPipeline } from "./pipeline";
import { getDesignFontCss, renderDesignPage } from "./renderer";
import { generateDesignObject, getDesignProviderSettings } from "./providers";

const examples: Array<{ id: string; prompt: string; slides: number; variants?: number; templateDirection?: boolean; brand?: Record<string, unknown> }> = [
  { id: "groq", prompt: "Create a premium Instagram poster announcing that EaseYourStartup now supports Groq. Audience: startup founders. Message: Groq is now available in our AI design studio. CTA: Make your next statement. Bold editorial typography; orange, warm paper and charcoal brand palette.", slides: 1 },
  { id: "launch", prompt: "A minimalist startup launch graphic for EaseYourStartup. Headline: Your next chapter starts here. CTA: Build your first campaign. Audience: solo founders. Use generous negative space and beautifully balanced type; no generic decoration.", slides: 1 },
  { id: "experimental", prompt: "An experimental typography-based technology advertisement for EaseYourStartup. Headline: Make some noise. Audience: independent makers. Radical type scale, asymmetry and purposeful SVG graphic geometry. CTA: Design your launch. No fabricated metrics.", slides: 1 },
  { id: "feature", prompt: "A premium product feature announcement: EaseYourStartup introduces editable design layers. Headline: Every detail is yours. Show an abstract, clearly illustrative type-and-grid diagram. CTA: Meet your design studio. No product screenshot or invented evidence.", slides: 1 },
  { id: "carousel", prompt: "A three-slide Instagram carousel for EaseYourStartup. Slide 1 headline: An idea deserves a voice. Slide 2 headline: Make it unmistakably yours. Slide 3 headline: Ready for the world. Explain brief, editable design, and export, respectively. Consistent brand, distinct page compositions, precise typography. Final CTA: Start your next design.", slides: 3 },
  // Template direction: a non-default brand checks color and font handling.
  { id: "template", prompt: "A launch poster for Northwind Ledger, bookkeeping software for freelancers. Message: invoices, receipts and tax estimates now live in one place. Audience: freelance designers and developers. CTA: Start free. Tone: calm, trustworthy, a little bold.", slides: 1, variants: 0, templateDirection: true, brand: { name: "Northwind Ledger", primary: "#2f6bff", secondary: "#101828", background: "#f4f1ea", headingFont: "Fraunces", bodyFont: "Inter", personality: "Calm, precise, trustworthy" } },
  { id: "template-carousel", prompt: "A three-slide LinkedIn carousel for EaseYourStartup announcing its AI design studio. Slide 1: turn every ship into a campaign. Slide 2: editable layers, real fonts, your brand. Slide 3: try it free today.", slides: 3, variants: 0, templateDirection: true },
  { id: "template-mixed", prompt: "An Instagram poster announcing that EaseYourStartup now exports launch kits for Product Hunt, X and LinkedIn in one click. Audience: indie hackers. Energetic, developer-native.", slides: 1, variants: 1, templateDirection: true },
];
describe.skipIf(process.env.RUN_LIVE_AI_TESTS !== "true")("live AI design studio examples", () => {
  beforeAll(() => {
    for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
    // Explicit test-only opt-in to reuse the already configured Groq-compatible
    // endpoint. Capabilities were checked against Groq's model/vision docs;
    // production always uses the operator's explicit registry.
    if (!process.env.DESIGN_AI_PROVIDERS_JSON && process.env.DESIGN_LIVE_USE_LEGACY_GROQ === "true") {
      if (new URL(process.env.OPENAI_BASE_URL || "").hostname !== "api.groq.com" || !process.env.OPENAI_MODEL) throw new Error("A Groq-compatible test configuration is required.");
      process.env.DESIGN_AI_PROVIDERS_JSON = JSON.stringify([{ id: "groq", protocol: "openai", baseUrl: process.env.OPENAI_BASE_URL, apiKeyEnv: "OPENAI_API_KEY", timeoutMs: 120000, maxRetries: 1, models: [
        { id: process.env.DESIGN_LIVE_TEXT_MODEL || "openai/gpt-oss-20b", tasks: process.env.DESIGN_LIVE_COMPOSITION_MODEL ? ["brief", "copy"] : ["brief", "direction", "plan", "copy"], vision: false, structuredOutput: true, structuredMode: "json_object", streaming: true, contextTokens: 131072, maxOutputTokens: 3000, parameters: { reasoningEffort: "low" } },
        { id: process.env.DESIGN_LIVE_MODEL || process.env.OPENAI_MODEL, tasks: process.env.DESIGN_LIVE_COMPOSITION_MODEL ? ["critique"] : ["composition", "critique", "edit"], vision: true, structuredOutput: true, structuredMode: "json_object", streaming: true, contextTokens: 131072, maxOutputTokens: process.env.DESIGN_LIVE_COMPOSITION_MODEL ? 900 : 6000 },
        ...(process.env.DESIGN_LIVE_COMPOSITION_MODEL ? [{ id: process.env.DESIGN_LIVE_COMPOSITION_MODEL, tasks: ["direction", "plan", "composition", "edit"], vision: false, structuredOutput: true, structuredMode: "json_object", streaming: true, contextTokens: 131072, maxOutputTokens: 3000, parameters: { reasoningEffort: "low" } }] : []),
      ] }, ...(process.env.DESIGN_LIVE_OPENROUTER_VISION_MODEL ? [{ id: "openrouter", protocol: "openai", baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY", timeoutMs: 120000, maxRetries: 1, models: [{ id: process.env.DESIGN_LIVE_OPENROUTER_VISION_MODEL, tasks: ["critique"], vision: true, structuredOutput: true, structuredMode: "json_object", streaming: true, contextTokens: 131072, maxOutputTokens: 2200, freeTier: true }] }] : [])]);
    }
    mkdirSync("output/design-studio/examples", { recursive: true });
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      const response = await originalFetch(url, options);
      if (!response.ok && String(url).includes("/chat/completions")) {
        const body = await response.clone().json().catch(() => ({}));
        let message = String(body.error?.message || "").slice(0, 1200);
        for (const key of [process.env.OPENAI_API_KEY, process.env.OPENROUTER_API_KEY]) if (key) message = message.replaceAll(key, "[redacted]");
        writeFileSync("output/design-studio/examples/provider-error.json", JSON.stringify({ status: response.status, code: body.error?.code, message }, null, 2));
      }
      return response;
    });
  });
  afterAll(() => vi.restoreAllMocks());
  it.each(examples.filter((example) => !process.env.DESIGN_LIVE_EXAMPLE || process.env.DESIGN_LIVE_EXAMPLE === example.id))("renders the $id brief through the real creative pipeline", async (example) => {
    const input = generationInputSchema.parse({ action: "generate", prompt: example.prompt, brand: brandKitSchema.parse(example.brand ?? {}), width: 1080, height: 1350, variants: example.variants ?? 1, templateDirection: example.templateDirection ?? false, slides: example.slides, revisionLimit: 3, tokenBudget: 120000 });
    const result = await runDesignPipeline(input, {
      // Separately exercise the supported text-only deployment path. Real
      // provider outputs and actual browser measurements remain in use.
      visionAvailable: process.env.DESIGN_LIVE_DISABLE_VISION === "true" ? false : undefined,
      generate: async (task, prompt, schema, options) => {
        // Live checks respect account Retry-After cooldowns; unlike production
        // they run directly instead of letting Inngest recover the failed step.
        for (let retry = 0; ; retry++) {
          try { return await generateDesignObject(task, prompt, schema, options); }
          catch (error) {
            if (process.env.DESIGN_LIVE_WAIT_FOR_QUOTA !== "true" || retry >= 3 || !(error instanceof Error) || !error.message.includes("rate_limit")) throw error;
            const cooldowns = getDesignProviderSettings().providers.map((provider) => Date.parse(provider.cooldownUntil ?? "") - Date.now()).filter((ms) => ms > 0);
            const delay = Math.min(60000, Math.max(1000, ...cooldowns)) + 250;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      },
      run: async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
        // Invalidate browser measurements after compiler/geometry changes while
        // retaining genuine completed provider responses for quota recovery.
        const cache = `output/design-studio/examples/${example.id}-step-${name.startsWith("render-") ? "v6" : "v5"}-${name}.json`;
        if (process.env.DESIGN_LIVE_RESUME === "true" && existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as T;
        const value = await operation(); writeFileSync(cache, JSON.stringify(value)); return value;
      },
      checkpoint: async (stage, state) => {
        writeFileSync(`output/design-studio/examples/${example.id}-progress.json`, JSON.stringify({ stage, ...state }, null, 2));
      },
    });
    expect(result.variants).toHaveLength((example.variants ?? 1) + (example.templateDirection ? 1 : 0));
    writeFileSync(`output/design-studio/examples/${example.id}.json`, JSON.stringify(result, null, 2));
    for (const variant of result.variants) {
      const document = variant.document;
      expect(document.pages).toHaveLength(example.slides);
      // Variant-qualified names keep template and custom outputs side by side.
      const name = result.variants.length > 1 || variant.id.startsWith("template-") ? `${example.id}-${variant.id}` : example.id;
      for (const [index, page] of document.pages.entries()) {
        const render = await renderDesignPage(document, page.id);
        writeFileSync(`output/design-studio/examples/${name}-${index + 1}.png`, render.png);
        writeFileSync(`output/design-studio/examples/${name}-${index + 1}.html`, renderDesignHtml(document, page.id, await getDesignFontCss(document)));
        writeFileSync(`output/design-studio/examples/${name}-${index + 1}-issues.json`, JSON.stringify(render.issues, null, 2));
        expect(render.width).toBe(1080); expect(render.height).toBe(1350);
        expect(render.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      }
    }
  }, 600000);
});
