import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireWorkspaceContext();
    const { id } = await params;
    const jobId = z.uuid().parse(id);
    const [job] = await context.database`
      select id, kind, status, progress, result, error_message, updated_at
      from public.jobs
      where id = ${jobId}
        and workspace_id = ${context.workspaceId}
      limit 1
    `;
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    return NextResponse.json({ job });
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
