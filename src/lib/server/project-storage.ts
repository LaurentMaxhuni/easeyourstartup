import "server-only";

import type { ScanResult } from "@/lib/contracts";
import type { DatabaseClient } from "@/lib/server/database";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export type ProjectSummary = {
  id: string;
  name: string;
  publicUrl: string | null;
  status: "active" | "archived";
  sourcePageCount: number;
  campaignCount: number;
  campaigns: Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | null;
  }>;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function asTimestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function asCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export async function listProjectsForUser(
  database: DatabaseClient,
  userId: string,
) {
  const workspaceId = await ensureWorkspaceForUser(database, userId);
  const rows = await database`
    select
      p.id,
      p.name,
      p.public_url,
      p.status,
      p.last_scanned_at,
      p.created_at,
      p.updated_at,
      count(distinct sp.id)::int as source_page_count,
      count(distinct c.id) filter (where c.status <> 'archived')::int as campaign_count,
      coalesce((
        select json_agg(json_build_object(
          'id', recent.id,
          'title', recent.title,
          'status', recent.status,
          'updatedAt', recent.updated_at
        ) order by recent.updated_at desc)
        from (
          select id, title, status, updated_at
          from public.campaigns
          where project_id = p.id
            and workspace_id = p.workspace_id
          order by updated_at desc
          limit 10
        ) recent
      ), '[]'::json) as campaigns
    from public.projects as p
    left join public.source_pages as sp
      on sp.project_id = p.id
      and sp.workspace_id = p.workspace_id
    left join public.campaigns as c
      on c.project_id = p.id
      and c.workspace_id = p.workspace_id
    where p.workspace_id = ${workspaceId}
    group by p.id
    order by coalesce(p.last_scanned_at, p.updated_at, p.created_at) desc
    limit 50
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    publicUrl: row.public_url ?? null,
    status: row.status,
    sourcePageCount: asCount(row.source_page_count),
    campaignCount: asCount(row.campaign_count),
    campaigns: (typeof row.campaigns === "string" ? JSON.parse(row.campaigns) : row.campaigns ?? []) as ProjectSummary["campaigns"],
    lastScannedAt: asTimestamp(row.last_scanned_at),
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
  })) as ProjectSummary[];
}

export async function createOrUpdateProjectForScan(
  database: DatabaseClient,
  options: {
    workspaceId: string;
    activeProjectLimit: number;
    projectId?: string;
    projectName: string;
    publicUrl: string;
  },
) {
  if (options.projectId) {
    const [project] = await database`
      update public.projects
      set
        name = ${options.projectName},
        public_url = ${options.publicUrl},
        updated_at = now()
      where id = ${options.projectId}
        and workspace_id = ${options.workspaceId}
        and status = 'active'
      returning id
    `;
    if (!project) throw new Error("Project not found.");
    return project.id as string;
  }

  const [project] = await database`
    with lifecycle_lock as materialized (
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(${options.workspaceId}::text || ':project-slots', 0)
      ) as locked
    ), available_slot as (
      select slots.slot::integer as active_slot
      from pg_catalog.generate_series(1, ${options.activeProjectLimit}) as slots(slot)
      cross join lifecycle_lock
      where not exists (
        select 1
        from public.projects as active_project
        where active_project.workspace_id = ${options.workspaceId}
          and active_project.status = 'active'
          and active_project.active_slot = slots.slot
      )
      order by slots.slot
      limit 1
    )
    insert into public.projects (workspace_id, name, public_url, active_slot)
    select
      ${options.workspaceId},
      ${options.projectName},
      ${options.publicUrl},
      available_slot.active_slot
    from available_slot
    on conflict (workspace_id, active_slot)
      where status = 'active' and active_slot is not null
      do nothing
    returning id
  `;

  if (!project) throw new Error("Active project limit reached.");
  return project.id as string;
}

export async function persistScanResultForProject(
  database: DatabaseClient,
  options: {
    workspaceId: string;
    projectId: string;
    result: ScanResult;
  },
) {
  const [saved] = await database`
    select public.persist_project_scan(
      ${options.workspaceId}::uuid,
      ${options.projectId}::uuid,
      null::uuid,
      ${JSON.stringify(options.result.profile)}::jsonb,
      ${options.result.mode},
      ${JSON.stringify(options.result.pages)}::jsonb,
      null::jsonb
    ) as persisted
  `;
  if (saved?.persisted !== true) throw new Error("The scan result was superseded.");
}
