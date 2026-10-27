import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { scanResultSchema } from "@/lib/contracts";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { id } = await params;
    const context = await requireWorkspaceContext();
    const [project] = await context.database`
      select p.id, p.name, p.public_url, p.status,
        bp.profile, bp.scan_mode, capture.id as capture_asset_id
      from public.projects p
      left join public.brand_profiles bp
        on bp.project_id = p.id and bp.workspace_id = p.workspace_id
      left join public.stored_assets capture
        on capture.id = bp.capture_asset_id and capture.project_id = p.id
        and capture.workspace_id = p.workspace_id
      where p.id = ${id}::uuid
        and p.workspace_id = ${context.workspaceId}
      limit 1
    `;
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

    const pages = await context.database`
      select url, title, excerpt
      from public.source_pages
      where project_id = ${id}::uuid
        and workspace_id = ${context.workspaceId}
      order by created_at asc
      limit 6
    `;
    const campaigns = await context.database`
      select c.id, c.project_id as "projectId", c.title, c.status, c.kind, c.launch_date, c.updated_at
      from public.campaigns c
      join public.projects p on p.id = c.project_id and p.workspace_id = c.workspace_id
      where c.workspace_id = ${context.workspaceId}
        and (c.project_id = ${id}::uuid or
          public.project_url_key(p.public_url) = public.project_url_key(${project.public_url}::text))
      order by c.updated_at desc
      limit 50
    `;
    let profile = project.profile;
    if (typeof profile === "string") {
      try { profile = JSON.parse(profile) as unknown; } catch { profile = null; }
    }
    const scan = profile
      ? scanResultSchema.safeParse({
          profile,
          pages,
          readiness: [],
          // Without a stored screenshot (for example, no object storage), capture the site live.
          desktopCaptureUrl: project.capture_asset_id
            ? `/api/assets/${project.capture_asset_id}`
            : project.public_url
              ? `/api/capture?${new URLSearchParams({ target: project.public_url, viewport: "desktop", projectId: project.id })}`
              : null,
          mobileCaptureUrl: null,
          warnings: [],
          mode: project.scan_mode === "demo" ? "demo" : "live",
        })
      : null;

    return NextResponse.json(
      { project: { id: project.id, name: project.name, publicUrl: project.public_url, status: project.status }, scan: scan?.success ? scan.data : null, campaigns },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Project could not be loaded." }, { status: 400 });
  }
}

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["active", "archived"]).optional(),
}).strict().refine((value) => value.name !== undefined || value.status !== undefined);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const projectId = z.uuid().parse(id);
    const input = updateProjectSchema.parse(await readJsonBody(request, 8_000));
    if (input.status === "archived") {
      const [project] = await context.database`
        with lifecycle_lock as materialized (
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(${context.workspaceId}::text || ':project-slots', 0)
          ) as locked
        )
        update public.projects p
        set status = 'archived', active_slot = null, updated_at = now()
        from lifecycle_lock
        where p.id = ${projectId}::uuid and p.workspace_id = ${context.workspaceId}
        returning p.id, p.name, p.status
      `;
      if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      return NextResponse.json({ project });
    }
    if (input.status === "active") {
      const [project] = await context.database`
        with lifecycle_lock as materialized (
          select pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(${context.workspaceId}::text || ':project-slots', 0)
          ) as locked
        ), available_slot as (
          select slots.slot::integer as active_slot
          from pg_catalog.generate_series(1, ${context.limits.activeProjects}) as slots(slot)
          cross join lifecycle_lock
          where not exists (
            select 1 from public.projects p
            where p.workspace_id = ${context.workspaceId}
              and p.status = 'active' and p.active_slot = slots.slot
          )
          order by slots.slot limit 1
        )
        update public.projects p
        set status = 'active', active_slot = available_slot.active_slot,
          name = coalesce(${input.name ?? null}, p.name), updated_at = now()
        from available_slot
        where p.id = ${projectId}::uuid
          and p.workspace_id = ${context.workspaceId}
          and p.status = 'archived'
        returning p.id, p.name, p.status
      `;
      if (!project) return NextResponse.json({ error: "No active project slot is available, or the project was not found." }, { status: 409 });
      return NextResponse.json({ project });
    }
    const [project] = await context.database`
      update public.projects
      set name = ${input.name}, updated_at = now()
      where id = ${projectId}::uuid
        and workspace_id = ${context.workspaceId}
        and status = 'active'
        and active_slot between 1 and ${context.limits.activeProjects}
      returning id, name, status
    `;
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Project could not be updated." }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const projectId = z.uuid().parse(id);
    const [deleted] = await context.database`
      with lifecycle_lock as materialized (
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(${context.workspaceId}::text || ':project-slots', 0)
        ) as locked
      ), owned_project as materialized (
        select p.id from public.projects p
        join public.projects selected on selected.id = ${projectId}::uuid
          and selected.workspace_id = p.workspace_id
        where p.workspace_id = ${context.workspaceId}
          and (p.id = selected.id or public.project_url_key(p.public_url) = public.project_url_key(selected.public_url))
          and exists (select 1 from lifecycle_lock)
      ), removed_assets as (
        delete from public.stored_assets
        where project_id in (select id from owned_project)
        returning object_key
      ), queued_cleanup as (
        insert into public.object_cleanup_queue (object_key)
        select object_key from removed_assets
        on conflict (object_key) do nothing
        returning object_key
      ), deleted_project as (
        delete from public.projects
        where id in (select id from owned_project)
          and (select count(*) from queued_cleanup) >= 0
        returning id
      )
      select id from deleted_project limit 1
    `;
    if (!deleted) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project could not be deleted.";
    return NextResponse.json({ error: message }, { status: message.includes("Project has active work") ? 409 : 400 });
  }
}
