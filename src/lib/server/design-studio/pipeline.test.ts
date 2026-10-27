import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
vi.mock("./providers", () => ({ generateDesignObject: vi.fn(), hasDesignVisionModel: () => false }));
vi.mock("./renderer", () => ({ renderDesignPage: vi.fn() }));
import { emptyDesignDocument } from "@/lib/design-studio/document";
import { generationInputSchema } from "@/lib/design-studio/workflow";
import { fitGeneratedDesignBounds, runDesignPipeline } from "./pipeline";

describe("creative production pipeline", () => {
  it("fits rotated generated layers within the canvas while preserving locked layers and source", () => {
    const original = emptyDesignDocument();
    original.pages[0].nodes[0] = { ...original.pages[0].nodes[0], x: 0, y: 0, rotation: -90 };
    original.pages[0].nodes.push({ ...original.pages[0].nodes[0], id: "locked", locked: true });
    const fitted = fitGeneratedDesignBounds(original);
    const node = fitted.pages[0].nodes[0];
    expect(node.rotation).toBe(-90);
    expect(node.x + node.width / 2 - node.height / 2).toBeGreaterThanOrEqual(-0.001);
    expect(node.y + node.height / 2 - node.width / 2).toBeGreaterThanOrEqual(-0.001);
    expect(fitted.pages[0].nodes[1]).toEqual(original.pages[0].nodes[1]);
    expect(original.pages[0].nodes[0].x).toBe(0);
  });
  it("renders incremental edits, preserves other content, and reports vision unavailability", async () => {
    const doc = emptyDesignDocument();
    const stages: string[] = [];
    const result = await runDesignPipeline({ action: "edit", prompt: "Move headline higher", document: doc, history: [], tokenBudget: 20000 }, {
      generate: async (_task, _prompt, schema) => ({ data: schema.parse({ explanation: "Moved the headline higher.", patches: [{ pageId: "page-1", nodeId: "headline", changes: { y: 80 } }] }), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } }),
      render: async () => ({ png: await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer(), width: 1080, height: 1350, issues: [] }),
      visionAvailable: false,
      checkpoint: async (stage) => { stages.push(stage); },
    });
    expect(result.variants[0].document.pages[0].nodes[0].y).toBe(80);
    expect(result.variants[0].document.pages[0].nodes[0].text).toBe("Your next\nbig idea.");
    expect(result.variants[0].document.pages[0].nodes[0].fontSize).toBe(132);
    expect(result.variants[0].visionAvailable).toBe(false);
    expect(stages).toContain("Rendering preview");
  });
  it("does not execute cancelled work", async () => {
    const controller = new AbortController(); controller.abort();
    const generate = vi.fn();
    await expect(runDesignPipeline({ action: "edit", prompt: "Change headline", document: emptyDesignDocument(), history: [], tokenBudget: 1000 }, {
      signal: controller.signal, generate, checkpoint: async () => {}, visionAvailable: false,
    })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it("creates distinct variants through separate brief, copy, direction, plan and composition stages and publishes the first render early", async () => {
    const events: string[] = [];
    let compositions = 0;
    let renders = 0;
    const input = generationInputSchema.parse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 3, revisionLimit: 0 });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const result = await runDesignPipeline(input, {
      visionAvailable: false,
      checkpoint: async (stage, state) => { if (state?.preview) events.push(`preview-${state.result?.variants.length}`); events.push(stage); },
      render: async () => ({ png, width: 1080, height: 1350, issues: renders++ === 0 ? [{ pageId: "page-1", nodeId: "headline", code: "text_overflow", severity: "error", message: "Measured overflow", suggestedFontSize: 100 }, { pageId: "page-1", nodeId: "headline", code: "low_contrast", severity: "error", message: "Measured contrast", suggestedFill: "#f05228" }] : [] }),
      generate: async (task, _prompt, schema) => {
        events.push(task);
        const data: Record<string, unknown> = {
          brief: { purpose: "Announce", audience: "Founders", message: "Integration is here", mood: "Confident", inspiration: "Editorial", requiredInformation: [], cta: "Try it", constraints: [] },
          copy: { headline: "Integration is here", supportingCopy: "", cta: "Try it", slides: [{ headline: "Integration is here", body: "", cta: "Try it" }] },
          direction: { directions: ["editorial", "experimental", "premium"].map((id) => ({ id, name: id, concept: id, typography: "Bold", colorRelationships: "Brand palette", grid: "Asymmetric", focalPoint: "Headline", hierarchy: "Headline first", decoration: "None", brandIntegration: "Name", spacing: "Generous" })) },
          plan: { pages: [{ id: "page-1", name: "Poster", background: "#f5f3ef", zones: [{ purpose: "Headline", x: 80, y: 120, width: 800, height: 400, typographySize: 88, alignment: "left" }], instructions: "Clear type" }] },
          composition: { title: "Integration", pages: emptyDesignDocument().pages.map((page) => ({ ...page, nodes: page.nodes.map((node) => ({ ...node, width: 600, x: 80 + compositions * 120 })) })) },
        };
        if (task === "composition") compositions++;
        return { data: schema.parse(data[task]), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
    });
    expect(result.variants.map((variant) => variant.document.pages[0].nodes[0].x)).toEqual([80, 200, 320]);
    expect(result.variants[0].document.pages[0].nodes[0].fontSize).toBe(100);
    expect(result.variants[0].document.pages[0].nodes[0].fill).toBe("#f05228");
    expect(result.variants[1].document.pages[0].nodes[0].fontSize).toBe(132);
    expect(events.indexOf("brief")).toBeLessThan(events.indexOf("copy"));
    expect(events.indexOf("copy")).toBeLessThan(events.indexOf("direction"));
    expect(events.indexOf("preview-1")).toBeLessThan(events.lastIndexOf("composition"));
    expect(result.variants.every((variant) => variant.feedback[0].vision === null && !variant.visionAvailable)).toBe(true);
    expect(events).not.toContain("critique");
  });
  it("generates and composes a distinct approved message for each pre-campaign direction", async () => {
    const input = generationInputSchema.parse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 2, distinctCopyPerDirection: true, revisionLimit: 0 });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const messages = [
      { message: "Connect your workspace in minutes.", headline: "Connect in minutes", body: "Bring every tool together.", cta: "Try it" },
      { message: "Keep every launch moving with less busywork.", headline: "Less busywork", body: "Spend more time shipping.", cta: "Get started" },
    ];
    const outputs: Record<string, unknown> = {
      brief: { purpose: "Announce", audience: "Founders", message: "Integration is here", mood: "Confident", inspiration: "Editorial", requiredInformation: [], cta: "Try it", constraints: [] },
      direction: { directions: ["editorial", "premium"].map((id) => ({ id, name: id, concept: id, typography: "Bold", colorRelationships: "Brand palette", grid: "Asymmetric", focalPoint: "Headline", hierarchy: "Headline first", decoration: "None", brandIntegration: "Name", spacing: "Generous" })) },
      plan: { pages: [{ id: "page-1", name: "Poster", background: "#f5f3ef", zones: [{ purpose: "Headline", x: 80, y: 120, width: 800, height: 400, typographySize: 88, alignment: "left" }], instructions: "Clear type" }] },
    };
    const calls: { task: string; prompt: string }[] = [];
    let copyIndex = 0;
    let compositionIndex = 0;
    const result = await runDesignPipeline(input, {
      visionAvailable: false, checkpoint: async () => {},
      render: async () => ({ png, width: 1080, height: 1350, issues: [] }),
      generate: async (task, prompt, schema) => {
        calls.push({ task, prompt });
        let data: unknown = outputs[task];
        if (task === "copy") data = { message: messages[copyIndex].message, headline: messages[copyIndex].headline, supportingCopy: messages[copyIndex].body, cta: messages[copyIndex].cta, slides: [{ headline: messages[copyIndex].headline, body: messages[copyIndex].body, cta: messages[copyIndex].cta }] };
        if (task === "composition") {
          const page = emptyDesignDocument().pages[0];
          page.nodes = page.nodes.map((node) => node.role === "headline" ? { ...node, x: 80 + compositionIndex * 120, width: 600, text: messages[compositionIndex].headline } : node);
          compositionIndex++;
          data = { title: "Concept", pages: [page] };
        }
        if (task === "copy") copyIndex++;
        return { data: schema.parse(data), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
    });
    const copyCalls = calls.filter((call) => call.task === "copy");
    expect(copyCalls).toHaveLength(2);
    expect(calls.findIndex((call) => call.task === "direction")).toBeLessThan(calls.findIndex((call) => call.task === "copy"));
    expect(copyCalls[1].prompt).toContain(messages[0].message.toLowerCase());
    expect(result.variants.map((variant) => variant.message)).toEqual(messages.map((copy) => copy.message));
    expect(result.variants.map((variant) => variant.document.pages[0].nodes.find((node) => node.role === "headline")?.text)).toEqual(messages.map((copy) => copy.headline));
    const compositionCalls = calls.filter((call) => call.task === "composition");
    expect(compositionCalls[0].prompt).toContain(`Approved concept message: "${messages[0].message}"`);
    expect(compositionCalls[0].prompt).toContain(`Page copy: {"headline":"${messages[0].headline}"`);
    expect(compositionCalls[1].prompt).toContain(`Approved concept message: "${messages[1].message}"`);
    expect(compositionCalls[1].prompt).toContain(`Page copy: {"headline":"${messages[1].headline}"`);
  });
  it("builds a template direction from model-chosen slots without custom directions", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const input = generationInputSchema.parse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 0, templateDirection: true, slides: 2, revisionLimit: 0 });
    const prompts: string[] = [];
    const result = await runDesignPipeline(input, {
      visionAvailable: false, checkpoint: async () => {},
      render: async () => ({ png, width: 1080, height: 1350, issues: [] }),
      generate: async (task, prompt, schema) => {
        prompts.push(task);
        const slide = { kicker: "Launching today", headline: "Integration is here", body: "Connect it in minutes.", cta: "Try it" };
        const data: Record<string, unknown> = {
          brief: { purpose: "Announce", audience: "Founders", message: "Integration is here", mood: "Confident", inspiration: "Editorial", requiredInformation: [], cta: "Try it", constraints: [] },
          copy: prompt.startsWith("Choose the hand-designed")
            ? { templateId: "big-type", reason: "Short punchy headline", slides: [slide, { ...slide, headline: "Set up in one click" }] }
            : { headline: "Integration is here", supportingCopy: "", cta: "Try it", slides: [{ headline: "Integration is here", body: "", cta: "Try it" }, { headline: "Set up in one click", body: "", cta: "Try it" }] },
        };
        return { data: schema.parse(data[task]), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
    });
    expect(prompts).toEqual(["brief", "copy", "copy"]);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].id).toBe("template-big-type");
    expect(result.variants[0].document.pages).toHaveLength(2);
    const headline = result.variants[0].document.pages[1].nodes.find((node) => node.role === "headline")!;
    expect(headline.text).toBe("Set up in one click");
    expect(headline.fontFamily).toBe("Anton");
    expect(result.variants[0].document.pages[1].nodes.some((node) => node.id === "slide-counter" && node.text === "02 / 02")).toBe(true);
    expect(result.variants[0].message).toBeUndefined();
  });
  it("exposes a distinct message for an opted-in template concept", async () => {
    const input = generationInputSchema.parse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 0, templateDirection: true, distinctCopyPerDirection: true, revisionLimit: 0 });
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const tasks: string[] = [];
    const result = await runDesignPipeline(input, {
      visionAvailable: false, checkpoint: async () => {},
      render: async () => ({ png, width: 1080, height: 1350, issues: [] }),
      generate: async (task, _prompt, schema) => {
        tasks.push(task);
        const data = task === "brief"
          ? { purpose: "Announce", audience: "Founders", message: "Integration is here", mood: "Confident", inspiration: "Editorial", requiredInformation: [], cta: "Try it", constraints: [] }
          : { templateId: "big-type", reason: "Short copy", message: "Connect your workspace in minutes.", slides: [{ kicker: "New", headline: "Connect in minutes", body: "Bring every tool together.", cta: "Try it" }] };
        return { data: schema.parse(data), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
    });
    expect(tasks).toEqual(["brief", "copy"]);
    expect(result.variants[0].message).toBe("Connect your workspace in minutes.");
  });
  it("records vision critique on template variants without rearranging them on vision alone", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const input = generationInputSchema.parse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 0, templateDirection: true, revisionLimit: 3 });
    const tasks: string[] = [];
    const result = await runDesignPipeline(input, {
      visionAvailable: true, checkpoint: async () => {},
      render: async () => ({ png, width: 1080, height: 1350, issues: [] }),
      generate: async (task, prompt, schema) => {
        tasks.push(task);
        const slide = { kicker: "New", headline: "Integration is here", body: "", cta: "Try it" };
        const data: Record<string, unknown> = {
          brief: { purpose: "Announce", audience: "Founders", message: "Integration is here", mood: "Confident", inspiration: "Editorial", requiredInformation: [], cta: "Try it", constraints: [] },
          copy: prompt.startsWith("Choose the hand-designed") ? { templateId: "swiss-grid", reason: "Clear", slides: [slide] } : { headline: "Integration is here", supportingCopy: "", cta: "Try it", slides: [{ headline: "Integration is here", body: "", cta: "Try it" }] },
          critique: { score: 60, issues: [{ pageId: "page-1", nodeId: "headline", severity: "error", category: "typography", message: "Headline looks clipped", suggestion: "Shrink it" }] },
        };
        return { data: schema.parse(data[task]), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
    });
    expect(tasks).not.toContain("edit");
    expect(result.variants[0].feedback).toHaveLength(1);
    expect(result.variants[0].feedback[0].vision?.score).toBe(60);
  });
  it("requires at least one direction", () => {
    expect(generationInputSchema.safeParse({ action: "generate", prompt: "Announce our new integration", brand: {}, variants: 0 }).success).toBe(false);
  });
  it("renders and checks targeted repairs, preserving the last working document if a later model request fails", async () => {
    const original = emptyDesignDocument();
    let calls = 0;
    let renders = 0;
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const result = await runDesignPipeline({ action: "edit", prompt: "Move the headline higher", document: original, history: [], tokenBudget: 10000 }, {
      visionAvailable: true, checkpoint: async () => {},
      generate: async (task, _prompt, schema) => {
        if (calls++) throw new Error("Vision quota unavailable");
        expect(task).toBe("edit");
        return { data: schema.parse({ explanation: "Moved", patches: [{ pageId: "page-1", nodeId: "headline", changes: { y: 80 } }] }), usage: { provider: "test", model: "test", inputTokens: 40, outputTokens: 40, latencyMs: 1, fallbacks: 0 } };
      },
      render: async () => { renders++; return { png, width: 1080, height: 1350, issues: [] }; },
    });
    expect(renders).toBe(1);
    expect(result.variants[0].feedback[0].visionStatus).toBe("failed");
    expect(result.variants[0].feedback[0].vision).toBeNull();
    expect(result.variants[0].document.pages[0].nodes[0].y).toBe(80);
    expect(original.pages[0].nodes[0].y).toBe(120);
  });
});
