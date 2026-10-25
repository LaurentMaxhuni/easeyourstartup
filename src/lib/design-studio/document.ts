import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const color = z.string().regex(/^(#[\da-fA-F]{6}|transparent)$/);
export const DESIGN_FONTS = ["Outfit", "Arial", "Georgia", "Verdana", "Courier New"] as const;
export const CANVAS_PRESETS = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], landscape: [1920, 1080] } as const;
export const designAssetSchema = z.object({
  id, name: z.string().max(120), kind: z.enum(["logo", "image", "reference"]),
  dataUrl: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
  description: z.string().max(600).default(""),
});
export const brandKitSchema = z.object({
  name: z.string().max(120).default("EaseYourStartup"),
  primary: color.default("#f05228"), secondary: color.default("#181818"), background: color.default("#f5f3ef"),
  headingFont: z.enum(DESIGN_FONTS).default("Outfit"), bodyFont: z.enum(DESIGN_FONTS).default("Outfit"),
  personality: z.string().max(1000).default("Confident, clear, resourceful"),
  spacing: z.enum(["compact", "balanced", "generous"]).default("generous"),
  motifs: z.string().max(1000).default("Purposeful typography and architectural grids"),
  references: z.string().max(2000).default(""),
  formats: z.array(z.string().max(100)).max(12).default(["Instagram portrait"]),
  memory: z.array(z.string().max(300)).max(20).default([]),
});
export const designNodeSchema = z.object({
  id, type: z.enum(["text", "rect", "ellipse", "line", "path", "image"]),
  name: z.string().max(100).default("Layer"), role: z.enum(["headline", "body", "cta", "logo", "decoration", "label"]).default("decoration"),
  x: z.number().min(-4096).max(8192), y: z.number().min(-4096).max(8192),
  width: z.number().positive().max(8192), height: z.number().positive().max(8192),
  rotation: z.number().min(-360).max(360).default(0), opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true), locked: z.boolean().default(false),
  fill: color.default("#181818"), stroke: color.default("transparent"), strokeWidth: z.number().min(0).max(100).default(0),
  radius: z.number().min(0).max(2048).default(0), text: z.string().max(4000).default(""),
  fontFamily: z.enum(DESIGN_FONTS).default("Outfit"), fontSize: z.number().min(8).max(600).default(48),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).default(500),
  lineHeight: z.number().min(0.7).max(3).default(1.15), letterSpacing: z.number().min(-20).max(60).default(0),
  align: z.enum(["left", "center", "right"]).default("left"),
  path: z.string().max(16000).regex(/^[MmZzLlHhVvCcSsQqTtAa0-9.,+\-\seE]*$/).default(""),
  assetId: id.optional(), fit: z.enum(["contain", "cover"]).default("contain"),
});
export const designPageSchema = z.object({
  id, name: z.string().min(1).max(120), width: z.number().int().min(320).max(4096),
  height: z.number().int().min(320).max(4096), background: color, nodes: z.array(designNodeSchema).min(1).max(100),
});
export const designDocumentSchema = z.object({
  version: z.literal(1), title: z.string().min(1).max(180), brand: brandKitSchema,
  assets: z.array(designAssetSchema).max(12).default([]), pages: z.array(designPageSchema).min(1).max(9),
}).superRefine((doc, ctx) => {
  if (doc.assets.reduce((size, asset) => size + asset.dataUrl.length, 0) > 8_000_000) ctx.addIssue({ code: "custom", message: "Combined approved assets must be 8 MB or smaller." });
  const pageIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const asset of doc.assets) {
    if (assetIds.has(asset.id)) ctx.addIssue({ code: "custom", message: "Duplicate asset ID" });
    assetIds.add(asset.id);
  }
  for (const page of doc.pages) {
    if (pageIds.has(page.id)) ctx.addIssue({ code: "custom", message: "Duplicate page ID" });
    pageIds.add(page.id);
    const nodeIds = new Set<string>();
    for (const node of page.nodes) {
      if (nodeIds.has(node.id)) ctx.addIssue({ code: "custom", message: "Duplicate layer ID" });
      nodeIds.add(node.id);
      if (node.type === "image" && (!node.assetId || !assetIds.has(node.assetId))) ctx.addIssue({ code: "custom", message: "Image must reference an approved asset" });
    }
  }
});
export const designNodeChangesSchema = z.object({
  x: designNodeSchema.shape.x.optional(), y: designNodeSchema.shape.y.optional(),
  width: designNodeSchema.shape.width.optional(), height: designNodeSchema.shape.height.optional(),
  name: designNodeSchema.shape.name.removeDefault().optional(), role: designNodeSchema.shape.role.removeDefault().optional(),
  rotation: designNodeSchema.shape.rotation.removeDefault().optional(), opacity: designNodeSchema.shape.opacity.removeDefault().optional(),
  visible: designNodeSchema.shape.visible.removeDefault().optional(), locked: designNodeSchema.shape.locked.removeDefault().optional(),
  fill: designNodeSchema.shape.fill.removeDefault().optional(), stroke: designNodeSchema.shape.stroke.removeDefault().optional(),
  strokeWidth: designNodeSchema.shape.strokeWidth.removeDefault().optional(), radius: designNodeSchema.shape.radius.removeDefault().optional(),
  text: designNodeSchema.shape.text.removeDefault().optional(), fontFamily: designNodeSchema.shape.fontFamily.removeDefault().optional(),
  fontSize: designNodeSchema.shape.fontSize.removeDefault().optional(), fontWeight: designNodeSchema.shape.fontWeight.removeDefault().optional(),
  lineHeight: designNodeSchema.shape.lineHeight.removeDefault().optional(), letterSpacing: designNodeSchema.shape.letterSpacing.removeDefault().optional(),
  align: designNodeSchema.shape.align.removeDefault().optional(), path: designNodeSchema.shape.path.removeDefault().optional(),
  assetId: designNodeSchema.shape.assetId, fit: designNodeSchema.shape.fit.removeDefault().optional(),
});
export const designPatchSchema = z.object({
  explanation: z.string().max(1200),
  patches: z.array(z.object({ pageId: id, nodeId: id, changes: designNodeChangesSchema })).max(100),
  additions: z.array(z.object({ pageId: id, node: designNodeSchema, index: z.number().int().min(0).max(100).optional() })).max(40).optional(),
  removals: z.array(z.object({ pageId: id, nodeId: id })).max(40).optional(),
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignNode = z.infer<typeof designNodeSchema>;
export type DesignPage = z.infer<typeof designPageSchema>;
export type BrandKit = z.infer<typeof brandKitSchema>;
export type DesignPatch = z.infer<typeof designPatchSchema>;
export type DesignAsset = z.infer<typeof designAssetSchema>;

export function emptyDesignDocument(): DesignDocument {
  return designDocumentSchema.parse({ version: 1, title: "Untitled design", brand: {}, assets: [], pages: [{
    id: "page-1", name: "Poster", width: 1080, height: 1350, background: "#f5f3ef", nodes: [{
      id: "headline", type: "text", name: "Headline", role: "headline", x: 80, y: 120, width: 920, height: 300,
      text: "Your next\nbig idea.", fontSize: 132, fontWeight: 700,
    }],
  }] });
}
export function applyDesignPatch(document: DesignDocument, input: DesignPatch): DesignDocument {
  const patch = designPatchSchema.parse(input);
  const result = structuredClone(document);
  for (const operation of patch.patches) {
    const node = result.pages.find((page) => page.id === operation.pageId)?.nodes.find((item) => item.id === operation.nodeId);
    if (!node) throw new Error("The edit refers to a missing layer.");
    if (node.locked) throw new Error("Unlock the layer before editing it.");
    Object.assign(node, operation.changes);
  }
  for (const operation of patch.removals ?? []) {
    const page = result.pages.find((item) => item.id === operation.pageId);
    const node = page?.nodes.find((item) => item.id === operation.nodeId);
    if (!page || !node) throw new Error("The removal refers to a missing layer.");
    if (node.locked) throw new Error("Unlock the layer before removing it.");
    page.nodes = page.nodes.filter((item) => item.id !== node.id);
  }
  for (const operation of patch.additions ?? []) {
    const page = result.pages.find((item) => item.id === operation.pageId);
    if (!page) throw new Error("The new layer refers to a missing page.");
    page.nodes.splice(operation.index ?? page.nodes.length, 0, operation.node);
  }
  return designDocumentSchema.parse(result);
}
export function designNodeStyle(node: DesignNode): Record<string, string | number> {
  return {
    position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height,
    transform: `rotate(${node.rotation}deg)`, transformOrigin: "center", opacity: node.opacity,
    display: node.visible ? "block" : "none", boxSizing: "border-box", color: node.fill,
    background: node.type === "rect" || node.type === "ellipse" ? node.fill : "transparent",
    border: ["rect", "ellipse", "image"].includes(node.type) ? `${node.strokeWidth}px solid ${node.stroke}` : "none",
    borderRadius: node.type === "ellipse" ? "50%" : node.radius,
    overflow: node.type === "image" ? "hidden" : "visible",
    WebkitTextStroke: node.type === "text" ? `${node.strokeWidth}px ${node.stroke}` : "0 transparent",
    paintOrder: "stroke fill",
    fontFamily: `"${node.fontFamily}", ${node.fontFamily === "Georgia" ? "serif" : "sans-serif"}`,
    fontSize: node.fontSize, fontWeight: node.fontWeight, lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing, textAlign: node.align, whiteSpace: "pre-wrap", overflowWrap: "break-word",
  };
}
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const unitless = new Set(["opacity", "fontWeight", "lineHeight"]);
export function renderDesignHtml(input: DesignDocument, pageId: string, fontCss = "", options: { watermark?: boolean } = {}): string {
  const doc = designDocumentSchema.parse(input);
  const page = doc.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("Page not found.");
  const layers = page.nodes.map((node) => {
    const style = Object.entries(designNodeStyle(node)).map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof value === "number" && !unitless.has(key) ? `${value}px` : value}`).join(";");
    let content = escape(node.text);
    if (node.type === "image") content = `<img alt="${escape(node.name)}" src="${doc.assets.find((asset) => asset.id === node.assetId)!.dataUrl}" style="width:100%;height:100%;object-fit:${node.fit}"/>`;
    else if (node.type === "line" || node.type === "path") content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${node.width} ${node.height}" width="100%" height="100%" aria-hidden="true">${node.type === "line" ? `<line x1="0" y1="0" x2="${node.width}" y2="${node.height}"` : `<path d="${node.path}"`} fill="${node.type === "line" ? "none" : node.fill}" stroke="${node.stroke}" stroke-width="${node.strokeWidth}"/></svg>`;
    else if (node.type !== "text") content = "";
    return `<div data-node-id="${node.id}" data-node-type="${node.type}" data-node-role="${node.role}" style="${escape(style)}">${content}</div>`;
  }).join("");
  const watermark = options.watermark ? '<div style="position:fixed;right:24px;bottom:24px;padding:8px 12px;background:#ffffff;color:#181818;border:1px solid #d5d5d5;font:600 18px Outfit,sans-serif;z-index:2147483647">Made with EaseYourStartup</div>' : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(doc.title)}</title><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;width:${page.width}px;height:${page.height}px}#design-canvas{position:relative;width:${page.width}px;height:${page.height}px;background:${page.background};overflow:hidden}img{display:block}svg{display:block}</style></head><body><main id="design-canvas">${layers}</main>${watermark}</body></html>`;
}
