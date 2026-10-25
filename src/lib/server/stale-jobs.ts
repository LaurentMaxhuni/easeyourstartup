import "server-only";

import type { DatabaseClient } from "@/lib/server/database";

// Scans and exports whose worker never ran or died stay unfinished forever,
// and clients poll them until they end. Fail them once they stop updating.
// Generations have their own cleanup in stale-generation-jobs.ts because
// failing them also releases usage reservations.
export const STALE_SCAN_AFTER = "10 minutes";
export const STALE_EXPORT_AFTER = "20 minutes";
const STALE_SCAN_ERROR = "The scan stopped without finishing. Scan the website again.";
const STALE_EXPORT_ERROR = "The export stopped without finishing. Your saved campaign is unchanged. Export it again.";

export async function failStaleScanAndExportJobs(
  database: DatabaseClient,
  jobId?: string,
  workspaceId?: string,
) {
  const scopedJobId = jobId ?? null;
  const scopedWorkspaceId = workspaceId ?? null;
  const failed = await database`
    update public.jobs
    set status = 'failed',
      error_message = case kind when 'scan' then ${STALE_SCAN_ERROR} else ${STALE_EXPORT_ERROR} end,
      updated_at = pg_catalog.now()
    where (
        (kind = 'scan' and status in ('queued', 'scanning', 'analyzing')
          and updated_at < pg_catalog.now() - ${STALE_SCAN_AFTER}::interval)
        or (kind = 'export' and status in ('queued', 'rendering')
          and updated_at < pg_catalog.now() - ${STALE_EXPORT_AFTER}::interval)
      )
      and (${scopedJobId}::uuid is null or id = ${scopedJobId}::uuid)
      and (${scopedWorkspaceId}::uuid is null or workspace_id = ${scopedWorkspaceId}::uuid)
    returning id
  `;
  return failed.length;
}
