import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { createDatabase } from "@/lib/server/database";
import { failStaleGenerationJobs } from "@/lib/server/stale-generation-jobs";
import { assertSameOrigin } from "@/lib/server/request-security";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const filtersSchema = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  projectId: z.uuid().optional(),
});

function timestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const params = new URL(request.url).searchParams;
    const parsed = filtersSchema.safeParse({
      q: params.get("q") ?? "",
      status: params.get("status") ?? "active",
      page: params.get("page") ?? "1",
      projectId: params.get("projectId") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the campaign filters and try again." }, { status: 400 });
    }
    const filters = parsed.data;
    const database = createDatabase();
    if (!database) {
      return NextResponse.json(
        { campaigns: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1, persistence: "local" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const workspaceId = await ensureWorkspaceForUser(database, auth.user.id);
    await failStaleGenerationJobs(database, undefined, workspaceId);
    const searchPattern = `%${filters.q}%`;
    const projectId = filters.projectId ?? null;
    const offset = (filters.page - 1) * PAGE_SIZE;
    const [countRows, rows] = await Promise.all([
      database`
        select count(*)::int as total
        from public.campaigns c
        join public.projects p
          on p.id = c.project_id and p.workspace_id = c.workspace_id
        where c.workspace_id = ${workspaceId}::uuid
          and (${projectId}::uuid is null or c.project_id = ${projectId}::uuid)
          and (
            ${filters.status} = 'all'
            or (${filters.status} = 'archived' and c.status = 'archived')
            or (${filters.status} = 'active' and c.status <> 'archived')
          )
          and (
            ${filters.q} = ''
            or c.title ilike ${searchPattern}
            or p.name ilike ${searchPattern}
          )
      `,
      database`
        select c.id, c.project_id, c.title, c.kind, c.status, c.updated_at,
          p.name as project_name, p.status as project_status
        from public.campaigns c
        join public.projects p
          on p.id = c.project_id and p.workspace_id = c.workspace_id
        where c.workspace_id = ${workspaceId}::uuid
          and (${projectId}::uuid is null or c.project_id = ${projectId}::uuid)
          and (
            ${filters.status} = 'all'
            or (${filters.status} = 'archived' and c.status = 'archived')
            or (${filters.status} = 'active' and c.status <> 'archived')
          )
          and (
            ${filters.q} = ''
            or c.title ilike ${searchPattern}
            or p.name ilike ${searchPattern}
          )
        order by c.updated_at desc, c.id desc
        limit ${PAGE_SIZE} offset ${offset}
      `,
    ]);
    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json(
      {
        campaigns: rows.map((row) => ({
          id: row.id,
          projectId: row.project_id,
          projectName: row.project_name,
          projectStatus: row.project_status,
          title: row.title,
          kind: row.kind,
          status: row.status,
          updatedAt: timestamp(row.updated_at),
        })),
        page: filters.page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        persistence: "database",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[campaigns] Failed to load campaign list.", error);
    return NextResponse.json(
      { error: "Your campaigns could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
