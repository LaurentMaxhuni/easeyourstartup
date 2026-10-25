import { describe, expect, it } from "vitest";
import { emptyDesignDocument } from "@/lib/design-studio/document";
import { commitHistory, createHistory, redoHistory, undoHistory } from "./history";

describe("design editor history", () => {
  it("restores full documents including assets and pages without mutating earlier revisions", () => {
    const original = emptyDesignDocument();
    const changed = { ...original, title: "Launch", pages: original.pages.map((page) => ({ ...page, nodes: page.nodes.map((node) => ({ ...node, x: 240 })) })) };
    const state = commitHistory(createHistory(original), changed);
    expect(undoHistory(state).present).toEqual(original);
    expect(redoHistory(undoHistory(state)).present).toEqual(changed);
    expect(original.pages[0].nodes[0].x).toBe(80);
  });
  it("discards redo after a new branch and ignores unchanged commits", () => {
    const initial = createHistory(emptyDesignDocument());
    expect(commitHistory(initial, structuredClone(initial.present))).toBe(initial);
    const edited = commitHistory(initial, { ...initial.present, title: "First" });
    const branched = commitHistory(undoHistory(edited), { ...initial.present, title: "Second" });
    expect(branched.future).toEqual([]);
    expect(redoHistory(branched)).toBe(branched);
  });
  it("bounds local history", () => {
    let state = createHistory(emptyDesignDocument());
    for (let i = 0; i < 90; i++) state = commitHistory(state, { ...state.present, title: `Revision ${i}` });
    expect(state.past).toHaveLength(50);
  });
});
