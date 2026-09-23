import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { studioStateSchema } from "@/lib/contracts";
import { createDatabase } from "@/lib/server/database";
import {
  getStudioStorageKey,
  loadStudioState,
  saveStudioState,
  StudioStateConflictError,
} from "@/lib/server/studio-state";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const MAX_STATE_BYTES = 3_000_000;

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const database = createDatabase();
    if (!database) {
      return NextResponse.json({
        state: null,
        persistence: "local",
        storageKey: getStudioStorageKey(user.id),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const campaignId = url.searchParams.get("campaignId");
    let stateResult;
    let recoveredState: ReturnType<typeof studioStateSchema.parse> | null = null;
    let activeJob: Record<string, unknown> | null = null;
    if (projectId) {
      const context = await requireWorkspaceContext();
      const [owned] = await context.database`
        select p.id, p.status, p.active_slot
        from public.projects p
        where p.id = ${projectId}::uuid
          and p.workspace_id = ${context.workspaceId}
        limit 1
      `;
      if (!owned) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      if (campaignId) {
        const [campaign] = await context.database`
          select id
          from public.campaigns
          where id = ${campaignId}::uuid
            and project_id = ${projectId}::uuid
            and workspace_id = ${context.workspaceId}
            and status <> 'archived'
          limit 1
        `;
        if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }
      stateResult = await loadStudioState(database, user.id, { projectId, campaignId });
      const [job] = await context.database`
        select id, kind, project_id, campaign_id, regeneration_channel
        from public.jobs
        where workspace_id = ${context.workspaceId}::uuid
          and project_id = ${projectId}::uuid
          and status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering')
          and (
            (kind = 'scan' and campaign_id is null)
            or (
              kind <> 'scan'
              and (
                campaign_id = ${campaignId ?? null}::uuid
                or (${campaignId ?? null}::uuid is null and campaign_id is null)
                or (${campaignId ?? null}::uuid is null and kind = 'generate' and campaign_id is not null)
              )
            )
          )
        order by created_at desc
        limit 1
      `;
      activeJob = (job as Record<string, unknown> | undefined) ?? null;
      if (activeJob && stateResult?.state) {
        const state = studioStateSchema.parse(stateResult.state);
        const nextType = activeJob.kind === "generate"
          ? activeJob.regeneration_channel ? "regenerate" : "generate"
          : activeJob.kind === "scan" || activeJob.kind === "export" ? activeJob.kind : null;
        if (nextType && typeof activeJob.id === "string") {
          recoveredState = studioStateSchema.parse({
            ...state,
            campaignId: activeJob.kind === "generate" && activeJob.campaign_id
              ? String(activeJob.campaign_id)
              : state.campaignId,
            jobId: activeJob.id,
            jobType: nextType,
          });
        }
      }
    } else {
      stateResult = await loadStudioState(database, user.id);
      const context = await requireWorkspaceContext();
      const [job] = await context.database`
        select id, kind, project_id, campaign_id, regeneration_channel
        from public.jobs
        where workspace_id = ${context.workspaceId}::uuid
          and status in ('queued', 'scanning', 'analyzing', 'generating', 'rendering')
        order by created_at desc
        limit 1
      `;
      activeJob = (job as Record<string, unknown> | undefined) ?? null;
      if (activeJob && typeof activeJob.id === "string" && typeof activeJob.project_id === "string") {
        const jobProjectId = String(activeJob.project_id);
        const jobCampaignId = typeof activeJob.campaign_id === "string" ? String(activeJob.campaign_id) : null;
        stateResult = await loadStudioState(database, user.id, {
          projectId: jobProjectId,
          campaignId: jobCampaignId,
        }) ?? (jobCampaignId
          ? await loadStudioState(database, user.id, { projectId: jobProjectId })
          : null);
        if (stateResult?.state) {
          const state = studioStateSchema.parse(stateResult.state);
          const nextType = activeJob.kind === "generate"
            ? activeJob.regeneration_channel ? "regenerate" : "generate"
            : activeJob.kind === "scan" || activeJob.kind === "export" ? activeJob.kind : null;
          if (nextType) {
            recoveredState = studioStateSchema.parse({
              ...state,
              projectId: jobProjectId,
              campaignId: jobCampaignId ?? state.campaignId,
              jobId: activeJob.id,
              jobType: nextType,
            });
          }
        }
      }
    }
    return NextResponse.json({
      state: recoveredState ?? stateResult?.state ?? null,
      activeJob: activeJob ? {
        id: activeJob.id,
        kind: activeJob.kind,
        projectId: activeJob.project_id,
        campaignId: activeJob.campaign_id,
        regenerationChannel: activeJob.regeneration_channel,
      } : null,
      revision: stateResult?.revision ?? null,
      persistence: "database",
      storageKey: getStudioStorageKey(user.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[studio-state] Failed to load editor snapshot.", error);
    return NextResponse.json(
      { error: "The saved studio state could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const body = await readJsonBody(request, MAX_STATE_BYTES);
    const wrapper = typeof body === "object" && body !== null && "state" in body
      ? body as { state: unknown; expectedRevision?: unknown }
      : { state: body, expectedRevision: null };
    const state = studioStateSchema.parse(wrapper.state);
    const expectedRevision = wrapper.expectedRevision === null || wrapper.expectedRevision === undefined
      ? null
      : Number(wrapper.expectedRevision);
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
      return NextResponse.json({ error: "Invalid save revision." }, { status: 400 });
    }
    const database = createDatabase();
    if (!database) {
      return NextResponse.json(
        { error: "Database persistence is not configured." },
        { status: 503 },
      );
    }

    if (state.projectId) {
      const context = await requireWorkspaceContext();
      const [owned] = await context.database`
        select p.id, p.status, p.active_slot
        from public.projects p
        where p.id = ${state.projectId}::uuid
          and p.workspace_id = ${context.workspaceId}
        limit 1
      `;
      if (!owned) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      if (owned.status !== "active" || owned.active_slot === null || Number(owned.active_slot) > context.limits.activeProjects) {
        return NextResponse.json({ error: "This project is read-only on your current plan. Restore a project slot or upgrade to make changes." }, { status: 403 });
      }
      if (state.campaignId) {
        const [campaign] = await context.database`
          select id
          from public.campaigns
          where id = ${state.campaignId}::uuid
            and project_id = ${state.projectId}::uuid
            and workspace_id = ${context.workspaceId}
            and status <> 'archived'
          limit 1
        `;
        if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }
    }

    const saved = await saveStudioState(database, user.id, state, expectedRevision);
    return NextResponse.json({
      ok: true,
      persistence: "database",
      savedAt: saved.savedAt,
      revision: saved.revision,
    });
  } catch (error) {
    if (error instanceof StudioStateConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[studio-state] Failed to save editor snapshot.", error);
    const message = error instanceof Error && /too large|valid JSON|Request body/.test(error.message)
      ? error.message
      : "The studio state could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
