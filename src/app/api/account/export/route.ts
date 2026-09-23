import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const [workspace, projects, brandProfiles, sourcePages, campaigns, outputs, editorStates, jobs, assets] = await Promise.all([
      context.database`select id, name, created_at, updated_at from public.workspaces where id = ${context.workspaceId}`,
      context.database`select * from public.projects where workspace_id = ${context.workspaceId} order by created_at`,
      context.database`select bp.* from public.brand_profiles bp where bp.workspace_id = ${context.workspaceId}`,
      context.database`select sp.* from public.source_pages sp where sp.workspace_id = ${context.workspaceId} order by created_at`,
      context.database`select * from public.campaigns where workspace_id = ${context.workspaceId} order by created_at`,
      context.database`select co.* from public.channel_outputs co where co.workspace_id = ${context.workspaceId} order by created_at`,
      context.database`select state, project_id, campaign_id, revision, updated_at from public.studio_states where user_id = ${context.user.id} order by updated_at`,
      context.database`select id, project_id, campaign_id, kind, status, progress, error_message, created_at, updated_at from public.jobs where workspace_id = ${context.workspaceId} order by created_at`,
      context.database`select id, project_id, campaign_id, mime_type, width, height, byte_size, sha256, created_at from public.stored_assets where workspace_id = ${context.workspaceId} order by created_at`,
    ]);
    return new NextResponse(JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: { id: context.user.id, email: context.user.email, name: context.user.name },
      workspace,
      projects,
      brandProfiles,
      sourcePages,
      campaigns,
      channelOutputs: outputs,
      editorStates,
      jobs,
      assets,
    }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="easeyourstartup-account-export.json"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account data could not be exported." }, {
      status: error instanceof AuthenticationRequiredError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
