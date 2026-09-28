import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { failStaleGenerationJobs, STALE_GENERATION_AFTER } from "@/lib/server/stale-generation-jobs";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const jobId = z.uuid().parse(id);
    const loadJob = () => context.database`
      select id, kind, status, progress, result, error_message, updated_at,
        kind = 'generate'
          and status in ('queued', 'generating')
          and updated_at < pg_catalog.now() - ${STALE_GENERATION_AFTER}::interval
          as stale_generation
      from public.jobs
      where id = ${jobId}
        and workspace_id = ${context.workspaceId}
      limit 1
    `;
    let [job] = await loadJob();
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    if (job.stale_generation === true) {
      await failStaleGenerationJobs(context.database, jobId, context.workspaceId);
      [job] = await loadJob();
      if (!job) {
        return NextResponse.json({ error: "Job not found." }, { status: 404 });
      }
    }
    const responseJob = { ...job };
    delete responseJob.stale_generation;
    return NextResponse.json({ job: responseJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job unavailable.";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof AuthenticationRequiredError ? error.status : 400,
      },
    );
  }
}
