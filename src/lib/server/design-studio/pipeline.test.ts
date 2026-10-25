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
