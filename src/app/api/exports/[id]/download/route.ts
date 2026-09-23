import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { canExportLaunchKit } from "@/lib/entitlements";
import { getPrivateObject } from "@/lib/server/object-storage";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireWorkspaceContext();
    if (!canExportLaunchKit(context.plan)) {
      return NextResponse.json({ error: "Campaign exports are available on Pro." }, { status: 403 });
    }
    const limit = await rateLimit(`export-download:${getRequestIdentity(request, context.workspaceId)}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return NextResponse.json({ error: "Download limit reached. Try again later." }, { status: 429 });

    const id = z.uuid().parse((await params).id);
    const [exportRequest] = await context.database`
      select j.status, j.error_message, r.object_key, r.mime_type, r.byte_size,
        r.file_name, r.download_expires_at
      from public.export_requests r
      join public.jobs j on j.id = r.job_id and j.workspace_id = r.workspace_id
      where r.job_id = ${id}::uuid
        and r.workspace_id = ${context.workspaceId}::uuid
        and r.requested_by = ${context.user.id}
      limit 1
    `;
    if (!exportRequest) return NextResponse.json({ error: "Export not found." }, { status: 404 });
    if (exportRequest.status === "failed") {
      return NextResponse.json({ error: exportRequest.error_message || "The export failed. Queue a new export to retry." }, { status: 409 });
    }
    if (exportRequest.status !== "completed" || typeof exportRequest.object_key !== "string") {
      return NextResponse.json({ error: "The export is still processing." }, { status: 409, headers: { "Retry-After": "3" } });
    }
    const expiresAt = exportRequest.download_expires_at instanceof Date
      ? exportRequest.download_expires_at
      : new Date(String(exportRequest.download_expires_at));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "This export has expired. Generate a new one from the saved campaign." }, { status: 410 });
    }
    const bytes = await getPrivateObject(exportRequest.object_key);
    if (bytes.byteLength !== Number(exportRequest.byte_size)) {
      return NextResponse.json({ error: "The stored export is incomplete. Generate it again from the saved campaign." }, { status: 503 });
    }
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Response(buffer, {
      headers: {
        "Content-Type": exportRequest.mime_type,
        "Content-Length": String(exportRequest.byte_size),
        "Content-Disposition": `attachment; filename="${exportRequest.file_name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError
      ? error.status
      : error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: status === 503 ? "The export download is temporarily unavailable." : "The export request is invalid or sign-in is required." }, { status });
  }
}
