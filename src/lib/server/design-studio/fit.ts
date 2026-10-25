import "server-only";

import { applyDesignPatch, type DesignDocument } from "@/lib/design-studio/document";
import { renderDesignPage, type RenderIssue } from "@/lib/server/design-studio/renderer";

type Render = typeof renderDesignPage;

async function renderIssues(document: DesignDocument, render: Render, signal?: AbortSignal) {
  const issues: RenderIssue[] = [];
  for (const page of document.pages) issues.push(...(await render(document, page.id, { scale: 1, signal })).issues);
  return issues;
}

const errorCount = (issues: RenderIssue[]) => issues.filter((issue) => issue.severity === "error").length;

// Applies the renderer's measured font sizes and approved contrast colors,
// the same repairs the generation pipeline makes, and keeps a pass only when
// a fresh render confirms no new errors. Template layouts estimate type from
// glyph metrics; this settles the residual overflow before a design is saved.
export async function fitDesignToRender(document: DesignDocument, options: { render?: Render; signal?: AbortSignal; passes?: number } = {}) {
  const render = options.render ?? renderDesignPage;
  let current = document;
  let issues = await renderIssues(current, render, options.signal);
  for (let pass = 0; pass < (options.passes ?? 3) && errorCount(issues) > 0; pass += 1) {
    const patches = issues.flatMap((issue) => {
      const node = current.pages.find((page) => page.id === issue.pageId)?.nodes.find((item) => item.id === issue.nodeId);
      if (!node || node.locked) return [];
      const changes: { fontSize?: number; fill?: string } = {};
      if (issue.code === "text_overflow" && issue.suggestedFontSize !== undefined && issue.suggestedFontSize < node.fontSize) changes.fontSize = issue.suggestedFontSize;
      if (issue.code === "low_contrast" && issue.suggestedFill) changes.fill = issue.suggestedFill;
      return Object.keys(changes).length ? [{ pageId: issue.pageId, nodeId: node.id, changes }] : [];
    });
    if (!patches.length) break;
    const fitted = applyDesignPatch(current, { explanation: "Apply browser-measured text fitting", patches });
    const checked = await renderIssues(fitted, render, options.signal);
    // Shrinking type can take more than one pass to clear an overflow.
    if (errorCount(checked) > errorCount(issues)) break;
    current = fitted;
    issues = checked;
  }
  return { document: current, issues };
}
