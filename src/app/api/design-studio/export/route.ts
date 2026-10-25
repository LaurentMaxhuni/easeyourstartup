import { z } from "zod";
import JSZip from "jszip";
import { designDocumentSchema, renderDesignHtml } from "@/lib/design-studio/document";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { rateLimit } from "@/lib/server/rate-limit";
import { renderDesignPage, getDesignFontCss } from "@/lib/server/design-studio/renderer";
import { designHttpError, DesignHttpError } from "@/lib/server/design-studio/http";
export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.object({ document: designDocumentSchema, pageId: z.string().max(64), scale: z.union([z.literal(1), z.literal(2)]).default(1), format: z.enum(["png", "html", "json", "zip"]) });
function assertExportLayout(issues: Awaited<ReturnType<typeof renderDesignPage>>["issues"]) {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new DesignHttpError(`Fix the rendered layout before exporting: ${errors.slice(0, 4).map((issue) => `${issue.code}${issue.nodeId ? ` (${issue.nodeId})` : ""}`).join(", ")}. Your editable design is preserved.`, 422);
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { workspaceId, limits } = await requireWorkspaceContext();
    if (!(await rateLimit(`design-export:${workspaceId}`, { limit: 30, windowMs: 3600000 })).allowed) throw new DesignHttpError("Design export limit reached.", 429);
    const { document, pageId, scale, format } = schema.parse(await readJsonBody(request, 12_000_000));
    if (format !== "json" && !limits.highResolutionExports) throw new DesignHttpError("Design exports are available on Pro Lite and Pro. You can save an editable JSON backup on your current plan.", 403);
    if (!document.pages.some((page) => page.id === pageId)) throw new DesignHttpError("Design page not found.", 404);
    const name = document.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "design";
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${name}.${format}"` };
    if (format === "json") return new Response(JSON.stringify(document, null, 2), { headers: { ...headers, "Content-Type": "application/json" } });
    if (format === "html") return new Response(renderDesignHtml(document, pageId, await getDesignFontCss(), { watermark: limits.watermarked }), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'" } });
    if (format === "png") {
      const rendered = await renderDesignPage(document, pageId, { scale, signal: request.signal, watermark: limits.watermarked });
      assertExportLayout(rendered.issues);
      return new Response(new Uint8Array(rendered.png), { headers: { ...headers, "Content-Type": "image/png", "X-Design-Issues": String(rendered.issues.length) } });
    }
    const zip = new JSZip();
    let archiveBytes = 0;
    zip.file("design.json", JSON.stringify(document, null, 2));
    const fontCss = await getDesignFontCss();
    for (const [index, page] of document.pages.entries()) {
      const rendered = await renderDesignPage(document, page.id, { scale, signal: request.signal, watermark: limits.watermarked });
      assertExportLayout(rendered.issues);
      const html = renderDesignHtml(document, page.id, fontCss, { watermark: limits.watermarked });
      archiveBytes += rendered.png.byteLength + Buffer.byteLength(html);
      if (archiveBytes > 48_000_000) throw new DesignHttpError("The export exceeded its size limit. Export individual slides.", 413);
      zip.file(`${String(index + 1).padStart(2, "0")}-${page.id}.png`, rendered.png);
      zip.file(`${String(index + 1).padStart(2, "0")}-${page.id}.html`, html);
      zip.file(`${String(index + 1).padStart(2, "0")}-${page.id}-checks.json`, JSON.stringify(rendered.issues, null, 2));
    }
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    if (bytes.byteLength > 48_000_000) throw new DesignHttpError("The export exceeded its size limit. Export individual slides.", 413);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/zip" } });
  } catch (error) { return designHttpError(error); }
}
