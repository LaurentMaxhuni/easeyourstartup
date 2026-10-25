import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/design-studio/renderer", () => ({ renderDesignPage: vi.fn() }));

import { emptyDesignDocument, type DesignDocument } from "@/lib/design-studio/document";
import { fitDesignToRender } from "./fit";

const overflow = (document: DesignDocument) => {
  const size = document.pages[0].nodes[0].fontSize;
  return size > 90
    ? [{ pageId: "page-1", nodeId: "headline", code: "text_overflow", severity: "error" as const, message: "overflow", suggestedFontSize: size - 30 }]
    : [];
};

it("applies measured font sizes until the render is clean", async () => {
  const render = vi.fn(async (document: DesignDocument) => ({ png: new Uint8Array(), width: 1, height: 1, issues: overflow(document) }));
  const result = await fitDesignToRender(emptyDesignDocument(), { render });
  expect(result.issues).toEqual([]);
  expect(result.document.pages[0].nodes[0].fontSize).toBe(72);
});

it("keeps the original when a measured fit adds errors", async () => {
  const issue = { pageId: "page-1", nodeId: "headline", code: "text_overflow", severity: "error" as const, message: "overflow", suggestedFontSize: 60 };
  const original = emptyDesignDocument();
  const render = vi.fn(async (document: DesignDocument) => ({ png: new Uint8Array(), width: 1, height: 1,
    issues: document === original ? [issue] : [issue, { ...issue, nodeId: "other" }] }));
  const result = await fitDesignToRender(original, { render });
  expect(result.document).toBe(original);
  expect(render).toHaveBeenCalledTimes(2);
});
