import "server-only";

import type { DatabaseClient } from "@/lib/server/database";

export const STALE_GENERATION_AFTER = "20 minutes";
export const STALE_GENERATION_ERROR =
  "Generation stopped after 20 minutes without a result. Try generating this campaign again.";

export async function failStaleGenerationJobs(
  database: DatabaseClient,
  jobId?: string,
  workspaceId?: string,
) {
  const scopedJobId = jobId ?? null;
  const scopedWorkspaceId = workspaceId ?? null;
  const [failedJobs] = await database.transaction([
    database`
      update public.jobs
      set status = 'failed',
        error_message = ${STALE_GENERATION_ERROR},
        updated_at = pg_catalog.now()
      where kind = 'generate'
        and status in ('queued', 'generating')
        and updated_at < pg_catalog.now() - ${STALE_GENERATION_AFTER}::interval
        and (${scopedJobId}::uuid is null or id = ${scopedJobId}::uuid)
        and (${scopedWorkspaceId}::uuid is null or workspace_id = ${scopedWorkspaceId}::uuid)
      returning id
    `,
    database`
      select public.release_campaign_usage_reservation(
        jobs.workspace_id,
        jobs.campaign_id
      )
      from public.jobs
      where kind = 'generate'
        and status = 'failed'
        and error_message = ${STALE_GENERATION_ERROR}
        and updated_at = pg_catalog.now()
        and campaign_id is not null
        and (${scopedJobId}::uuid is null or id = ${scopedJobId}::uuid)
        and (${scopedWorkspaceId}::uuid is null or workspace_id = ${scopedWorkspaceId}::uuid)
    `,
  ]);

  return failedJobs?.length ?? 0;
}
