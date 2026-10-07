import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { compositionImageUrls } from "@/lib/studio-export";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { canExportLaunchKit } from "@/lib/entitlements";
import { studioStateSchema } from "@/lib/contracts";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const requestSchema = z.object({
  format: z.enum(["png", "zip"]),
  projectId: z.uuid(),
  campaignId: z.uuid(),
  expectedRevision: z.number().int().positive(),
}).strict();

function storedAssetId(value: string) {
  try {
    const path = new URL(value, "https://easeyourstartup.invalid").pathname;
    const match = path.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function safeFilename(name: string, extension: "png" | "zip") {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign";
  return `${slug}-launch-kit.${extension}`;
}

function responseError(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Account deletion is pending.")) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Check the campaign and export options." }, { status: 400 });
  }
  return NextResponse.json(
    { error: "The saved campaign export could not be queued. Please retry." },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    if (!canExportLaunchKit(context.plan)) {
      return NextResponse.json({ error: "Campaign exports are available on Pro." }, { status: 403 });
    }
    if (!process.env.INNGEST_EVENT_KEY) {
      return NextResponse.json({ error: "Durable exports are not configured." }, { status: 503 });
    }
    const limit = await rateLimit(
      `export:${getRequestIdentity(request, context.workspaceId)}`,
      { limit: 8, windowMs: 60 * 60 * 1000 },
    );
    if (!limit.allowed) return NextResponse.json({ error: "Export limit reached. Try again later." }, { status: 429 });

    const input = requestSchema.parse(await readJsonBody(request, 4_000));
    const suppliedKey = request.headers.get("idempotency-key")?.trim();
    if (!suppliedKey || suppliedKey.length > 200) {
      return NextResponse.json({ error: "An idempotency key is required for exports." }, { status: 400 });
    }
    const idempotencyKey = createHash("sha256")
      .update(`${context.workspaceId}:${suppliedKey}`)
      .digest("hex");

    const [existingJob] = await context.database`
      select id, kind, status, progress
      from public.jobs
      where workspace_id = ${context.workspaceId}::uuid
        and idempotency_key = ${idempotencyKey}
      limit 1
    `;
    if (existingJob) {
      if (existingJob.kind !== "export") {
        return NextResponse.json({ error: "This operation key was already used for another job." }, { status: 409 });
      }
      return NextResponse.json({
        job: { id: existingJob.id, status: existingJob.status, progress: existingJob.progress },
        created: false,
      }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    const [campaign] = await context.database`
      select p.status as project_status, p.active_slot,
        c.id as campaign_id, c.status as campaign_status
      from public.projects p
      join public.campaigns c
        on c.project_id = p.id and c.workspace_id = p.workspace_id
      where p.id = ${input.projectId}::uuid
        and c.id = ${input.campaignId}::uuid
        and p.workspace_id = ${context.workspaceId}::uuid
      limit 1
    `;
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    if (
      campaign.project_status !== "active" || campaign.active_slot === null ||
      Number(campaign.active_slot) > context.limits.activeProjects
    ) {
      return NextResponse.json({ error: "This project's exports are read-only on your current plan." }, { status: 403 });
    }
    if (campaign.campaign_status !== "completed") {
      return NextResponse.json({ error: "Finish campaign generation before exporting." }, { status: 409 });
    }

    const [savedState] = await context.database`
      select state, revision
      from public.studio_states
      where user_id = ${context.user.id}
        and project_id = ${input.projectId}::uuid
        and campaign_id = ${input.campaignId}::uuid
      limit 1
    `;
    if (!savedState) return NextResponse.json({ error: "Save this campaign before exporting." }, { status: 409 });
    const revision = Number(savedState.revision);
    if (revision !== input.expectedRevision) {
      return NextResponse.json({ error: "This campaign changed while the export was starting. Save again and retry." }, { status: 409 });
    }
    const rawState = typeof savedState.state === "string"
      ? JSON.parse(savedState.state) as unknown
      : savedState.state;
    const parsed = studioStateSchema.safeParse(rawState);
    if (
      !parsed.success ||
      parsed.data.projectId !== input.projectId ||
      parsed.data.campaignId !== input.campaignId ||
      !parsed.data.brand || !parsed.data.scan || !parsed.data.generation || parsed.data.outputs.length === 0
    ) {
      return NextResponse.json({ error: "The saved campaign is incomplete. Reopen it, save, and retry." }, { status: 409 });
    }

    const assetIds = compositionImageUrls(parsed.data.composition).map(storedAssetId);
    if (assetIds.some((id) => id === null)) {
      return NextResponse.json({ error: "Replace embedded or external screenshots with a saved project image before exporting." }, { status: 409 });
    }
    const distinctIds = Array.from(new Set(assetIds as string[]));
    const assets = await context.database`
      select id::text as id
      from public.stored_assets
      where id = any(${distinctIds}::uuid[])
        and workspace_id = ${context.workspaceId}::uuid
        and owner_user_id = ${context.user.id}
        and project_id = ${input.projectId}::uuid
        and (campaign_id is null or campaign_id = ${input.campaignId}::uuid)
    `;
    if (assets.length !== distinctIds.length) {
      return NextResponse.json({ error: "One or more campaign images are no longer available. Upload them again and retry." }, { status: 409 });
    }

    const projectName = parsed.data.brand.projectName;
    const [job] = await context.database`
      select * from public.enqueue_export_job(
        ${context.workspaceId}::uuid,
        ${context.user.id}::text,
        ${input.projectId}::uuid,
        ${input.campaignId}::uuid,
        ${context.limits.activeProjects},
        ${input.format},
        ${revision},
        ${JSON.stringify(parsed.data)}::jsonb,
        ${safeFilename(projectName, input.format)},
        ${randomUUID()}::uuid,
        ${idempotencyKey},
        ${randomUUID()}::uuid
      )
    `;
    if (job?.allowed !== true || typeof job.job_id !== "string") {
      const reason = typeof job?.reason === "string" ? job.reason : "unavailable";
      const message = reason === "revision_changed"
        ? "This campaign changed while the export was starting. Save again and retry."
        : reason === "project_or_campaign_unavailable"
          ? "This project or campaign is not available for export."
          : "The export could not be queued. Please retry.";
      return NextResponse.json({ error: message }, { status: reason === "revision_changed" ? 409 : 403 });
    }
    return NextResponse.json({
      job: { id: job.job_id, status: job.status, progress: job.progress },
      created: job.created === true,
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[exports] Saved campaign export could not be queued.");
    return responseError(error);
  }
}
