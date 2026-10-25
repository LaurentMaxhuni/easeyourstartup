import "server-only";

import type { ScanResult } from "@/lib/contracts";
import type { DatabaseClient } from "@/lib/server/database";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export type ProjectSummary = {
  id: string;
  projectIds?: string[];
  name: string;
  publicUrl: string | null;
  status: "active" | "archived";
  sourcePageCount: number;
  campaignCount: number;
  campaigns: Array<{
    id: string;
    projectId?: string;
    title: string;
    status: string;
    updatedAt: string | null;
  }>;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  brand?: ProjectBrandSummary | null;
};

// The scanned look of a project, for recognisable dashboard cards.
export type ProjectBrandSummary = {
  tagline: string;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
  accentColor: string | null;
};

function asTimestamp(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : null;
}

function asHttpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function asHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

// logoUrl is left out on purpose: scans sometimes pick a customer logo from
// the page, while the favicon is always the site's own mark.
export function projectBrandSummary(profile: unknown): ProjectBrandSummary | null {
  const parsed = typeof profile === "string" ? JSON.parse(profile) as unknown : profile;
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const visual = record.visualSystem && typeof record.visualSystem === "object"
    ? record.visualSystem as Record<string, unknown>
    : {};
  const colors = Array.isArray(record.colors) ? record.colors : [];
  const brand = {
    tagline: typeof record.tagline === "string" ? record.tagline.replace(/\s+/g, " ").trim().slice(0, 160) : "",
    faviconUrl: asHttpsUrl(record.faviconUrl),
    coverImageUrl: asHttpsUrl(record.imageUrl),
    backgroundColor: asHexColor(visual.backgroundColor) ?? asHexColor(colors[0]),
    foregroundColor: asHexColor(visual.foregroundColor),
    accentColor: asHexColor(visual.accentColor) ?? asHexColor(colors[1]),
  };
  return Object.entries(brand).some(([, value]) => value) ? brand : null;
}

function asCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

export function groupProjectsByUrl(projects: ProjectSummary[]): ProjectSummary[] {
  const groups = new Map<string, ProjectSummary>();
  for (const project of projects) {
    let key = project.id;
    if (project.publicUrl) {
      try {
        const url = new URL(project.publicUrl);
        key = url.origin + url.pathname.replace(/\/+$/, "") + url.search;
      } catch { /* Legacy invalid URLs remain separate. */ }
    }
    const campaigns = project.campaigns.map((campaign) => ({ ...campaign, projectId: campaign.projectId ?? project.id }));
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...project, projectIds: [project.id], campaigns });
      continue;
    }
    const primary = previous.status === "archived" && project.status === "active" ? project : previous;
    groups.set(key, {
      ...primary,
      projectIds: [...previous.projectIds!, project.id],
      brand: primary.brand ?? (primary === project ? previous.brand : project.brand) ?? null,
      sourcePageCount: Math.max(previous.sourcePageCount, project.sourcePageCount),
      campaignCount: previous.campaignCount + project.campaignCount,
      campaigns: [...previous.campaigns, ...campaigns]
        .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
        .slice(0, 10),
    });
  }
  return [...groups.values()];
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
      bp.profile as brand_profile,
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
    left join public.brand_profiles as bp
      on bp.project_id = p.id
      and bp.workspace_id = p.workspace_id
    left join public.source_pages as sp
      on sp.project_id = p.id
      and sp.workspace_id = p.workspace_id
    left join public.campaigns as c
      on c.project_id = p.id
      and c.workspace_id = p.workspace_id
    where p.workspace_id = ${workspaceId}
    group by p.id, bp.id
    order by coalesce(p.last_scanned_at, p.updated_at, p.created_at) desc
    limit 50
  `;

  return groupProjectsByUrl(rows.map((row) => ({
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
    brand: projectBrandSummary(row.brand_profile),
  })) as ProjectSummary[]);
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
  const [project] = await database`
    select public.get_or_create_scan_project(
      ${options.workspaceId}::uuid,
      ${options.projectId ?? null}::uuid,
      ${options.projectName},
      ${options.publicUrl},
      ${options.activeProjectLimit}
    ) as id
  `;
  if (!project?.id) throw new Error(options.projectId ? "Project not found or active project limit reached." : "Active project limit reached.");
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
