import "server-only";
import { z } from "zod";
import sharp from "sharp";
import { applyDesignPatch, designDocumentSchema, designNodeSchema, designPageSchema, designPatchSchema, type DesignDocument } from "@/lib/design-studio/document";
import { alternativeLayoutCount, designJobInputSchema, generationInputSchema, type DesignJobInput, type DesignStage } from "@/lib/design-studio/workflow";
import { generateDesignObject, hasDesignVisionModel, type AiUsage, type DesignTask } from "./providers";
import { renderDesignPage, type RenderIssue } from "./renderer";

const briefSchema = z.object({
  purpose: z.string().max(500), audience: z.string().max(500), message: z.string().max(500),
  mood: z.string().max(300), inspiration: z.string().max(800), requiredInformation: z.array(z.string().max(500)).max(12),
  cta: z.string().max(200), constraints: z.array(z.string().max(500)).max(12),
});
const copySchema = z.object({
  headline: z.string().min(1).max(180), supportingCopy: z.string().max(400), cta: z.string().max(100),
  slides: z.array(z.object({ headline: z.string().max(180), body: z.string().max(400), cta: z.string().max(100) })).min(1).max(9),
});
const directionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,50}$/), name: z.string().max(120), concept: z.string().max(1200),
  typography: z.string().max(600), colorRelationships: z.string().max(600), grid: z.string().max(600),
  focalPoint: z.string().max(500), hierarchy: z.string().max(500), decoration: z.string().max(500),
  brandIntegration: z.string().max(500), spacing: z.string().max(500),
});
const directionsSchema = z.object({ directions: z.array(directionSchema).min(1).max(3) });
const planSchema = z.object({ pages: z.array(z.object({
  id: z.string().max(64), name: z.string().max(120), background: z.string().regex(/^#[\da-fA-F]{6}$/),
  zones: z.array(z.object({ purpose: z.string().max(200), x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive(), typographySize: z.number().positive(), alignment: z.enum(["left", "center", "right"]) })).min(1).max(20),
  instructions: z.string().max(2500),
})).min(1).max(9) });
const compositionSchema = z.object({ title: z.string().min(1).max(180), pages: z.array(designPageSchema.extend({ nodes: z.array(designNodeSchema.extend({ role: designNodeSchema.shape.role.removeDefault() })).min(1).max(100) })).min(1).max(9) });
const critiqueSchema = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(z.object({ pageId: z.string().max(64), nodeId: z.string().max(64).optional(), severity: z.enum(["error", "warning"]), category: z.enum(["typography", "layout", "hierarchy", "contrast", "readability", "alignment", "brand", "originality"]), message: z.string().max(600), suggestion: z.string().max(600) })).max(20),
});
const referenceAnalysisSchema = z.object({
  composition: z.string().max(1000), typography: z.string().max(1000), grid: z.string().max(1000),
  colorRelationships: z.string().max(1000), principles: z.array(z.string().max(500)).max(8),
});
export type DesignFeedback = { round: number; deterministic: RenderIssue[]; vision: z.infer<typeof critiqueSchema> | null; visionStatus: "available" | "unavailable" | "failed"; warning?: string };
export type DesignVariant = { id: string; name: string; direction?: z.infer<typeof directionSchema>; document: DesignDocument; feedback: DesignFeedback[]; visionAvailable: boolean };
export type PipelineResult = { variants: DesignVariant[]; usage: AiUsage[]; warnings: string[] };
export type PipelineCheckpoint = { result?: PipelineResult; preview?: { dataUrl: string; pageId: string } };
export function resolveDesignTokenBudget(requested: number) {
  const configured = process.env.DESIGN_JOB_TOKEN_BUDGET?.trim();
  const ceiling = configured ? Number(configured) : 200000;
  if (!Number.isSafeInteger(ceiling) || ceiling < 1000 || ceiling > 200000) throw new Error("The server design token ceiling must be an integer between 1000 and 200000.");
  return Math.min(requested, ceiling);
}
type PipelineServices = {
  generate?: typeof generateDesignObject; render?: typeof renderDesignPage; visionAvailable?: boolean; signal?: AbortSignal;
  checkpoint: (stage: DesignStage, state?: PipelineCheckpoint) => Promise<void>;
  onUsage?: (usage: AiUsage) => Promise<void>;
  getRemainingTokens?: () => Promise<number>;
  run?: <T>(name: string, operation: () => Promise<T>) => Promise<T>;
};
function documentContext(document: DesignDocument) {
  const baseline = designNodeSchema.parse({ id: "defaults", type: "rect", x: 0, y: 0, width: 1, height: 1 });
  const core = new Set(["id", "type", "x", "y", "width", "height", "role"]);
  const nodeDefaults = Object.fromEntries(Object.entries(baseline).filter(([key]) => !core.has(key)));
  return { ...document, nodeDefaults,
    assets: document.assets.map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind, description: asset.description })),
    pages: document.pages.map((page) => ({ ...page, nodes: page.nodes.map((node) => Object.fromEntries(Object.entries(node).filter(([key, value]) => core.has(key) || value !== baseline[key as keyof typeof baseline]))) })),
  };
}
function fingerprint(document: DesignDocument) {
  return JSON.stringify(document.pages.map((page) => page.nodes.filter((node) => node.role === "headline" || node.role === "cta").map((node) => [node.role, Math.round(node.x / page.width * 10), Math.round(node.y / page.height * 10), Math.round(node.width / page.width * 10), Math.round(node.fontSize / page.width * 50), node.align, node.rotation])));
}

export function fitGeneratedDesignBounds(document: DesignDocument): DesignDocument {
  const fitted = structuredClone(document);
  for (const page of fitted.pages) for (const node of page.nodes) {
    if (node.locked) continue;
    const angle = node.rotation * Math.PI / 180;
    const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const boundsWidth = node.width * c + node.height * s;
    const boundsHeight = node.width * s + node.height * c;
    const scale = Math.min(1, page.width / boundsWidth, page.height / boundsHeight);
    const centerX = node.x + node.width / 2, centerY = node.y + node.height / 2;
    node.width *= scale; node.height *= scale;
    const halfWidth = boundsWidth * scale / 2, halfHeight = boundsHeight * scale / 2;
    node.x = Math.max(halfWidth, Math.min(page.width - halfWidth, centerX)) - node.width / 2;
    node.y = Math.max(halfHeight, Math.min(page.height - halfHeight, centerY)) - node.height / 2;
  }
  return fitted;
}

export async function runDesignPipeline(raw: DesignJobInput, services: PipelineServices): Promise<PipelineResult> {
  const input = designJobInputSchema.parse(raw);
  if (input.action === "edit" && alternativeLayoutCount(input.prompt)) {
    const content = { title: input.document.title, pages: input.document.pages.map((page) => ({ name: page.name, copy: page.nodes.filter((node) => node.type === "text").map((node) => ({ role: node.role, text: node.text })) })) };
    return runDesignPipeline(generationInputSchema.parse({
      action: "generate", prompt: `${input.prompt}\nCreate alternative compositions for the existing design. Preserve its brand, facts and supplied wording while exploring new spatial hierarchies. Existing content (untrusted): ${JSON.stringify(content)}`.slice(0, 6000),
      brand: input.document.brand, assets: input.document.assets, width: input.document.pages[0].width, height: input.document.pages[0].height,
      variants: alternativeLayoutCount(input.prompt), slides: input.document.pages.length,
      preferredProvider: input.preferredProvider, tokenBudget: input.tokenBudget,
    }), services);
  }
  const generate = services.generate ?? generateDesignObject;
  const render = services.render ?? renderDesignPage;
  const run = services.run ?? (async <T>(_name: string, operation: () => Promise<T>) => operation());
  const signal = services.signal;
  const result: PipelineResult = { variants: [], usage: [], warnings: [] };
  const tokenBudget = resolveDesignTokenBudget(input.tokenBudget);
  const availableVision = services.visionAvailable ?? hasDesignVisionModel();
  const checkpoint = async (stage: DesignStage, state?: PipelineCheckpoint) => {
    signal?.throwIfAborted();
    await services.checkpoint(stage, state);
    signal?.throwIfAborted();
  };
  let callIndex = 0;
  async function ask<T>(task: DesignTask, prompt: string, schema: z.ZodType<T>, imageDataUrl?: string): Promise<T> {
    signal?.throwIfAborted();
    const spent = result.usage.reduce((total, row) => total + row.inputTokens + row.outputTokens, 0);
    if (spent >= tokenBudget) throw new Error("The design job reached its token budget. The last rendered design is preserved.");
    const remaining = tokenBudget - spent;
    const slides = input.action === "generate" ? input.slides : input.document.pages.length;
    const outputBudget: Record<DesignTask, number> = { brief: 1400, direction: 2800, plan: Math.min(6500, 2200 * slides), composition: Math.min(14000, 4500 * slides), critique: 2200, edit: 3000, copy: Math.min(4500, 1300 * slides) };
    const response = await run(`ai-${callIndex++}-${task}`, async () => {
      const callRemaining = Math.min(remaining, await services.getRemainingTokens?.() ?? remaining);
      if (callRemaining < 128) throw new Error("The design job reached its persistent token budget. The last working design is preserved.");
      const usage: AiUsage[] = [];
      const generated = await generate(task, prompt, schema, {
        signal, imageDataUrl, preferredProvider: input.preferredProvider,
        maxOutputTokens: Math.min(outputBudget[task], Math.floor(callRemaining / 2)),
        maxTotalTokens: Math.min(callRemaining, 131072),
        onUsage: async (entry) => { usage.push(entry); await services.onUsage?.(entry); },
      });
      return { data: generated.data, usage: usage.length ? usage : [generated.usage] };
    });
    result.usage.push(...response.usage);
    return schema.parse(response.data);
  }
  function patchSchemaFor(document: DesignDocument) {
    return designPatchSchema.superRefine((patch, context) => {
      try { applyDesignPatch(document, patch); }
      catch { context.addIssue({ code: "custom", path: ["patches"], message: "Use existing unlocked page/layer targets for patches and removals, unique IDs for additions, and valid final document bounds." }); }
    });
  }
  async function renderPages(document: DesignDocument, label: string) {
    await checkpoint("Rendering preview");
    // Screenshots are bounded by renderer. Store only the small preview/vision image in durable steps.
    return run(`render-v3-${label}`, async () => {
      const pages = [];
      for (const page of document.pages) {
        signal?.throwIfAborted();
        const captured = await render(document, page.id, { scale: 1, signal });
        // Durable-step payloads stay small even for nine slides or a 4096px canvas.
        let preview = Buffer.alloc(0);
        for (const [width, quality] of [[1200, 75], [960, 65], [720, 55]]) {
          preview = await sharp(captured.png).resize({ width, height: width, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
          if (preview.byteLength <= 250000) break;
        }
        if (preview.byteLength > 250000) throw new Error("The rendered preview exceeds its durable-job limit. Simplify the composition or use a smaller canvas.");
        pages.push({ pageId: page.id, dataUrl: `data:image/jpeg;base64,${preview.toString("base64")}`, issues: captured.issues.slice(0, 100) });
      }
      return pages;
    });
  }
  async function renderAndFit(variant: DesignVariant, label: string) {
    variant.document = fitGeneratedDesignBounds(variant.document);
    let rendered = await renderPages(variant.document, label);
    const patches = rendered.flatMap((page) => page.issues.flatMap((issue) => {
      const node = variant.document.pages.find((item) => item.id === page.pageId)?.nodes.find((item) => item.id === issue.nodeId);
      if (!node || node.locked) return [];
      const changes: { fontSize?: number; fill?: string } = {};
      if (issue.code === "text_overflow" && issue.suggestedFontSize !== undefined && issue.suggestedFontSize < node.fontSize) changes.fontSize = issue.suggestedFontSize;
      if (issue.code === "low_contrast" && issue.suggestedFill) changes.fill = issue.suggestedFill;
      return Object.keys(changes).length ? [{ pageId: page.pageId, nodeId: node.id, changes }] : [];
    }));
    if (!patches.length) return rendered;
    const fitted = applyDesignPatch(variant.document, { explanation: "Apply browser-measured text fitting and approved brand contrast", patches });
    const checked = await renderPages(fitted, `${label}-fit`);
    if (checked.flatMap((page) => page.issues).filter((issue) => issue.severity === "error").length < rendered.flatMap((page) => page.issues).filter((issue) => issue.severity === "error").length) {
      variant.document = fitted;
      rendered = checked;
    }
    return rendered;
  }
  async function evaluateAndRefine(variant: DesignVariant, limit: number, initial?: Awaited<ReturnType<typeof renderPages>>) {
    let rendered = initial ?? await renderPages(variant.document, `${variant.id}-initial`);
    await checkpoint("Evaluating design", { result: structuredClone(result), preview: { pageId: rendered[0].pageId, dataUrl: rendered[0].dataUrl } });
    for (let round = 0; round <= limit; round++) {
      const deterministic = rendered.flatMap((page) => page.issues);
      const visionIssues: z.infer<typeof critiqueSchema>["issues"] = [];
      let minScore = 100;
      let visionStatus: DesignFeedback["visionStatus"] = availableVision ? "available" : "unavailable";
      let warning: string | undefined;
      if (availableVision) {
        for (const page of rendered) {
          try {
            const critique = await ask("critique", `Evaluate this actual screenshot as a creative director. Report at most five specific, actionable deficiencies. Review typography, hierarchy, contrast, readability, alignment, brand consistency, originality and composition. Intentional negative space and a single well-used brand typeface are valid; do not invent a requirement for more decoration, another font or different brand colors. Use ONLY existing page/layer IDs supplied; omit nodeId for a whole-page issue. Page: ${page.pageId}. Document context: ${JSON.stringify(documentContext(variant.document))}`, critiqueSchema, page.dataUrl);
            minScore = Math.min(minScore, critique.score);
            visionIssues.push(...critique.issues);
          } catch (error) {
            signal?.throwIfAborted();
            visionStatus = "failed";
            warning = error instanceof Error ? error.message : "Visual critique was unavailable.";
            break;
          }
        }
      }
      variant.feedback.push({ round, deterministic, vision: visionStatus === "available" ? { score: minScore, issues: visionIssues } : null, visionStatus, ...(warning ? { warning } : {}) });
      variant.visionAvailable = visionStatus === "available";
      await checkpoint("Evaluating design", { result: structuredClone(result) });
      const needsRevision = deterministic.some((issue) => issue.severity === "error") || visionIssues.some((issue) => issue.severity === "error") || (minScore < 80 && visionIssues.length > 0);
      if (!needsRevision || round >= limit) break;
      await checkpoint("Refining composition");
      try {
        const patch = await ask("edit", `Repair the specific issues below. Preserve successful decisions, approved wording, brand palette/fonts, assets, unrelated layers and locked layers. Use incremental property patches for existing layer IDs. New individual layers go in additions, and specific layer deletions go in removals only when needed. Never replace the entire document. Current document: ${JSON.stringify(documentContext(variant.document))}. Issues: ${JSON.stringify({ deterministic, visionIssues })}`, patchSchemaFor(variant.document));
        if (!patch.patches.length && !patch.additions?.length && !patch.removals?.length) break;
        const candidate: DesignVariant = { ...variant, document: applyDesignPatch(variant.document, patch) };
        const revised = await renderAndFit(candidate, `${variant.id}-revision-${round}`);
        variant.document = candidate.document;
        rendered = revised;
        await checkpoint("Evaluating design", { result: structuredClone(result), preview: { pageId: rendered[0].pageId, dataUrl: rendered[0].dataUrl } });
      } catch (error) {
        signal?.throwIfAborted();
        result.warnings.push(error instanceof Error ? error.message : "Revision failed; the last working design was preserved.");
        break;
      }
    }
  }
  if (input.action === "edit") {
    await checkpoint("Refining composition");
    const patch = await ask("edit", `You are editing an existing design. Apply exactly the requested change using incremental node property patches. Preserve every unrelated property, page, word, brand color, asset, and locked layer. Add/remove individual nodes using additions/removals only when the requested change requires them. Never invent unsupported claims or a replacement document. User request: ${JSON.stringify(input.prompt)}. Recent instructions: ${JSON.stringify(input.history)}. Document: ${JSON.stringify(documentContext(input.document))}`, patchSchemaFor(input.document));
    const variant: DesignVariant = { id: "refinement", name: patch.explanation || "Refinement", document: applyDesignPatch(input.document, patch), feedback: [], visionAvailable: false };
    result.variants.push(variant);
    await evaluateAndRefine(variant, 0);
  } else {
    const brandContext = JSON.stringify({ brand: input.brand, assets: input.assets.map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind, description: asset.description })) });
    await checkpoint("Interpreting brief");
    let references = "";
    const referenceAssets = input.assets.filter((asset) => asset.kind === "reference");
    if (availableVision && referenceAssets.length) {
      for (const reference of referenceAssets.slice(0, 3)) {
        try {
          const analysis = await ask("critique", `Analyze this reference poster's composition, typography, visual hierarchy, color relationships, grid and spacing. Extract principles without copying its artwork or wording. User inspiration notes: ${JSON.stringify(reference.description)}. Describe only characteristics observable in the attached image.`, referenceAnalysisSchema, reference.dataUrl);
          references += JSON.stringify(analysis) + "\n";
        } catch { signal?.throwIfAborted(); result.warnings.push("A reference could not be analyzed with vision; its written description is still used."); }
      }
    } else if (referenceAssets.length) result.warnings.push("Reference vision analysis is unavailable; written reference descriptions are used.");
    const brief = await ask("brief", `Interpret the creative request. Extract purpose, audience, message, mood, inspiration, required information, CTA and constraints. Supply sensible defaults. Never invent product facts, metrics, customer quotes or capabilities. User request: ${JSON.stringify(input.prompt)}. Selected brand: ${brandContext}. Reference principles: ${references}. Canvas ${input.width}x${input.height}; ${input.slides} slides.`, briefSchema);
    const copy = await ask("copy", `Write concise, credible advertising copy for a professional poster. Aim for a punchy 4-9 word headline; required information can be in the supporting copy. Avoid repeating the headline in the supporting copy. A stated factual message is not necessarily an exact headline. Preserve exact headline/CTA wording ONLY when the user explicitly requests it. Never invent claims, metrics, testimonials or capabilities. Return exactly ${input.slides} slide messages. Brief: ${JSON.stringify(brief)}. Original request: ${JSON.stringify(input.prompt)}. Brand: ${brandContext}.`, copySchema);
    if (copy.slides.length !== input.slides) throw new Error("The copy did not match the requested slide count.");
    await checkpoint("Developing art direction");
    const directionSet = await ask("direction", `Develop exactly ${input.variants} professional poster art directions with truly distinct hierarchies, focal points and spatial silhouettes. Define a memorable typographic or vector concept that communicates the message. At 1080px width, a display headline often needs roughly 96-220px type; specify pixels, never points. Choose the size intentionally for the actual copy. Include the brand name as a clear wordmark. Avoid a centered headline-body-button webpage stack. Consider editorial, Swiss/modernist typography, experimental tech and premium product advertising as appropriate to the message. Avoid glow, generic cards, random decorative circles and repeated rounded rectangles. Work within the selected brand. Brief: ${JSON.stringify(brief)}. Brand: ${brandContext}. References: ${references}`, directionsSchema);
    if (directionSet.directions.length !== input.variants) throw new Error("The model did not return the requested number of distinct directions.");
    if (new Set(directionSet.directions.map((direction) => direction.id)).size !== input.variants) throw new Error("Each art direction must have a unique ID.");
    const seen = new Set<string>();
    for (const direction of directionSet.directions) {
      await checkpoint("Planning layout");
      const boundedPlanSchema = planSchema.superRefine((plan, context) => {
        if (plan.pages.length !== input.slides) context.addIssue({ code: "custom", path: ["pages"], message: `Return exactly ${input.slides} pages.` });
      });
      const plan = await ask("plan", `Translate this art direction into exactly ${input.slides} pages at ${input.width}x${input.height}. Set explicit pixel coordinate zones, alignments, typography sizes, backgrounds, negative space, brand-name and CTA placement. Verify every zone stays inside the canvas: x+width<=${input.width}, y+height<=${input.height}, all coordinates nonnegative. Give text enough height for all wrapped lines, and inset CTA text from its shape. Design the complete poster silhouette rather than a web-page stack. Each carousel page serves a distinct narrative purpose. Every major element needs a purpose. Brief: ${JSON.stringify(brief)}. Copy: ${JSON.stringify(copy)}. Direction: ${JSON.stringify(direction)}. Brand: ${brandContext}. Prior variant geometry signatures to avoid: ${JSON.stringify([...seen])}`, boundedPlanSchema);
      // Correct minor coordinate excursions without discarding the art direction
      // or spending another model call on arithmetic. Final rendered geometry
      // still goes through the browser's actual boundary/layout checks.
      for (const page of plan.pages) for (const zone of page.zones) {
        zone.width = Math.min(input.width, zone.width); zone.height = Math.min(input.height, zone.height);
        zone.x = Math.max(0, Math.min(input.width - zone.width, zone.x));
        zone.y = Math.max(0, Math.min(input.height - zone.height, zone.y));
      }
      await checkpoint("Building composition");
      const pages: DesignDocument["pages"] = [];
      let title = "";
      for (const [pageIndex, plannedPage] of plan.pages.entries()) {
        const pageSchema = compositionSchema.extend({ pages: compositionSchema.shape.pages.length(1) });
        const continuity = pages.map((page) => ({ background: page.background, typography: page.nodes.filter((node) => node.role === "headline" || node.role === "body").slice(0, 3).map((node) => ({ role: node.role, fontFamily: node.fontFamily, fontSize: node.fontSize, fill: node.fill })) }));
        const composition = await ask("composition", `Author an outstanding editable poster for page ${pageIndex + 1} of ${input.slides}. Return EXACTLY ONE page at ${input.width}x${input.height}, compiled to HTML/CSS/SVG. Use text/rect/ellipse/line/path/image layers; array order is back-to-front. Use valid numeric SVG paths, no scripts/raw HTML/CSS/external resources. Use approved raster asset IDs only. Fonts: Outfit, Arial, Georgia, Verdana, Courier New. All text stays editable. Set fontSize, weight, lineHeight and fill intentionally; honor the planned display typography. Assign semantic roles and meaningful layer names. Omit unused/default fields to keep JSON compact. Allow enough height for wrapped text, inset CTA labels, keep all layers inside the canvas, and show the brand name. No fabricated logos, facts or metrics. Preserve approved wording and brand colors/fonts. Brief: ${JSON.stringify(brief)}. Page copy: ${JSON.stringify(copy.slides[pageIndex])}. Direction: ${JSON.stringify(direction)}. Page plan: ${JSON.stringify(plannedPage)}. Brand: ${brandContext}. Prior page typography for continuity: ${JSON.stringify(continuity)}. Avoid prior variant signatures: ${JSON.stringify([...seen])}`, pageSchema);
        if (!title) title = composition.title;
        pages.push({ ...composition.pages[0], id: plannedPage.id });
      }
      const document = designDocumentSchema.parse({ title, pages, version: 1, brand: input.brand, assets: input.assets });
      if (document.pages.length !== input.slides || document.pages.some((page) => page.width !== input.width || page.height !== input.height)) throw new Error("The composition did not match the requested canvas or slide count.");
      for (const page of document.pages) for (const node of page.nodes) {
        if (node.type === "image" && document.assets.find((asset) => asset.id === node.assetId)?.kind === "logo") node.fit = "contain";
      }
      const signature = fingerprint(document);
      if (seen.has(signature)) throw new Error("The model repeated an existing layout. Existing successful variants are preserved; retry to explore another direction.");
      seen.add(signature);
      const variant: DesignVariant = { id: direction.id, name: direction.name, direction, document, feedback: [], visionAvailable: false };
      // Publish a variant only after it can actually be rendered.
      const firstRender = await renderAndFit(variant, `${direction.id}-validation`);
      result.variants.push(variant);
      await checkpoint("Evaluating design", { result: structuredClone(result), preview: { pageId: firstRender[0].pageId, dataUrl: firstRender[0].dataUrl } });
      await evaluateAndRefine(variant, input.revisionLimit, firstRender);
    }
  }
  await checkpoint("Ready to edit/export", { result: structuredClone(result) });
  return result;
}
