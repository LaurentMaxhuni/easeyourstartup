import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { getPrivateObject } from "@/lib/server/object-storage";
import { assertSameOrigin } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const id = z.uuid().parse((await params).id);
    const [asset] = await context.database`
      select object_key, mime_type, byte_size
      from public.stored_assets
      where id = ${id}::uuid and workspace_id = ${context.workspaceId}
      limit 1
    `;
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    const bytes = await getPrivateObject(asset.object_key);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Length": String(asset.byte_size),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json({ error: status === 503 ? "Stored asset is unavailable." : "Sign in required." }, { status });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const id = z.uuid().parse((await params).id);
    const [asset] = await context.database`
      with allowed_asset as materialized (
        select a.id, a.object_key
        from public.stored_assets a
        join public.projects p on p.id = a.project_id and p.workspace_id = a.workspace_id
        where a.id = ${id}::uuid
          and a.workspace_id = ${context.workspaceId}::uuid
          and p.status = 'active'
          and p.active_slot between 1 and ${context.limits.activeProjects}
      ), removed_asset as (
        delete from public.stored_assets a
        where a.id in (select id from allowed_asset)
        returning object_key
      ), queued_cleanup as (
        insert into public.object_cleanup_queue (object_key)
        select object_key from removed_asset
        on conflict (object_key) do nothing
        returning object_key
      )
      select object_key from removed_asset limit 1
    `;
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json({ error: status === 503 ? "Stored asset could not be deleted." : "Sign in required." }, { status });
  }
}
