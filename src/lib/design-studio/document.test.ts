import { describe, expect, it } from "vitest";
import { applyDesignPatch, designDocumentSchema, designNodeSchema, emptyDesignDocument, renderDesignHtml } from "./document";

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
  it("compiles declarative gradients, textures, shadows and blending to CSS", () => {
    const doc = emptyDesignDocument();
    const [headline] = doc.pages[0].nodes;
    doc.pages[0].nodes = [
      designNodeSchema.parse({ id: "bg", type: "rect", x: 0, y: 0, width: 1080, height: 1350, fill: "#101010", gradient: { kind: "radial", centerX: 30, centerY: 20, stops: [{ color: "#f05228", position: 0 }, { color: "#101010", position: 100, opacity: 0 }] }, pattern: { kind: "grain", opacity: 0.1 } }),
      designNodeSchema.parse({ ...headline, fontFamily: "Anton", fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", textWrap: "balance", shadows: [{ x: 8, y: 8, color: "#000000", opacity: 1 }], blendMode: "screen" }),
    ];
    const html = renderDesignHtml(designDocumentSchema.parse(doc), "page-1");
    expect(html).toContain("radial-gradient(circle at 30% 20%,rgba(240,82,40,1) 0%,rgba(16,16,16,0) 100%)");
    expect(html).toContain("data:image/svg+xml,");
    expect(html).toContain("text-shadow:8px 8px 0px rgba(0,0,0,1)");
    expect(html).toContain("mix-blend-mode:screen");
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("text-wrap-style:balance");
    // Anton has a single 400 master; heavier weights would be faux-bolded.
    expect(html).toContain("font-weight:400");
    expect(html).toContain('font-family:&quot;Anton&quot;, sans-serif');
    // Only the inline grain image and its internal filter reference use url().
    expect(html).not.toMatch(/url\((?!&quot;data:image\/svg\+xml|%23g\))/);
  });
  it("rejects free-form CSS in paint fields and removes optional paint with null", () => {
    const doc = emptyDesignDocument();
    expect(designNodeSchema.safeParse({ ...doc.pages[0].nodes[0], gradient: { kind: "linear", stops: [{ color: "url(x)", position: 0 }, { color: "#000000", position: 100 }] } }).success).toBe(false);
    const styled = applyDesignPatch(doc, { explanation: "Add", patches: [{ pageId: "page-1", nodeId: "headline", changes: { gradient: { kind: "linear", angle: 90, centerX: 50, centerY: 50, stops: [{ color: "#ffffff", position: 0, opacity: 1 }, { color: "#000000", position: 100, opacity: 1 }] } } }] });
    expect(styled.pages[0].nodes[0].gradient?.angle).toBe(90);
    expect(renderDesignHtml(styled, "page-1")).toContain("-webkit-background-clip:text");
    const cleared = applyDesignPatch(styled, { explanation: "Remove", patches: [{ pageId: "page-1", nodeId: "headline", changes: { gradient: null } }] });
    expect(cleared.pages[0].nodes[0].gradient).toBeUndefined();
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
