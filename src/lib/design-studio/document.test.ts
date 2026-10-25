import { describe, expect, it } from "vitest";
import { applyDesignPatch, designDocumentSchema, emptyDesignDocument, renderDesignHtml } from "./document";

describe("editable design documents", () => {
  it("escapes content and rejects external resources and executable SVG", () => {
    const doc = emptyDesignDocument();
    doc.pages[0].nodes.push({ ...doc.pages[0].nodes[0], id: "hostile", text: '<script>alert(1)</script>' });
    const html = renderDesignHtml(doc, doc.pages[0].id);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("default-src 'none'");
    expect(designDocumentSchema.safeParse({ ...doc, assets: [{ id: "remote", name: "remote", kind: "image", dataUrl: "http://localhost/secret" }] }).success).toBe(false);
    expect(designDocumentSchema.safeParse({ ...doc, pages: [{ ...doc.pages[0], nodes: [{ ...doc.pages[0].nodes[0], type: "path", path: '<script/>' }] }] }).success).toBe(false);
  });
  it("applies incremental changes without altering unrelated nodes and rejects unknown targets", () => {
    const doc = emptyDesignDocument();
    const next = applyDesignPatch(doc, { patches: [{ pageId: "page-1", nodeId: "headline", changes: { y: 200 } }], explanation: "Raised headline" });
    expect(next.pages[0].nodes[0].y).toBe(200);
    expect(next.pages[0].nodes[0].text).toBe(doc.pages[0].nodes[0].text);
    expect(doc.pages[0].nodes[0].y).toBe(120);
    expect(() => applyDesignPatch(doc, { patches: [{ pageId: "missing", nodeId: "headline", changes: { y: 1 } }], explanation: "" })).toThrow();
  });
  it("adds and removes individual layers atomically while preserving locked and unrelated layers", () => {
    const doc = emptyDesignDocument();
    const extra = { ...doc.pages[0].nodes[0], id: "subhead", text: "A clear supporting idea", y: 500 };
    const next = applyDesignPatch(doc, { explanation: "Add a subhead", patches: [], additions: [{ pageId: "page-1", node: extra }] });
    expect(next.pages[0].nodes.map((node) => node.id)).toEqual(["headline", "subhead"]);
    expect(next.pages[0].nodes[0]).toEqual(doc.pages[0].nodes[0]);
    next.pages[0].nodes[0].locked = true;
    expect(() => applyDesignPatch(next, { explanation: "Remove", patches: [], removals: [{ pageId: "page-1", nodeId: "headline" }] })).toThrow(/Unlock/);
    expect(applyDesignPatch(next, { explanation: "Remove subhead", patches: [], removals: [{ pageId: "page-1", nodeId: "subhead" }] }).pages[0].nodes).toHaveLength(1);
  });
});
