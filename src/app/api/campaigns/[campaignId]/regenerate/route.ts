import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { channelSchema } from "@/lib/contracts";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const context = await requireWorkspaceContext();
    const campaignId = z.uuid().parse((await params).campaignId);
    const [campaign] = await context.database`
      select id from public.campaigns
      where id = ${campaignId}::uuid and workspace_id = ${context.workspaceId}
        and status <> 'archived'
      limit 1
    `;
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const rows = await context.database`
      select channel, regeneration_count, regeneration_reserved
      from public.channel_outputs
      where campaign_id = ${campaignId}::uuid and workspace_id = ${context.workspaceId}
    `;
    const usage = Object.fromEntries(rows.map((row) => [
      row.channel,
      Math.max(0, context.limits.regenerationsPerChannel - Number(row.regeneration_count ?? 0) - Number(row.regeneration_reserved ?? 0)),
    ]));
    return NextResponse.json({ maxPerChannel: context.limits.regenerationsPerChannel, remaining: usage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Regeneration usage could not be loaded." }, { status });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    if (context.limits.regenerationsPerChannel === 0) return NextResponse.json({ error: "Channel regeneration is available on Pro Lite and Pro." }, { status: 403 });
    if (!process.env.INNGEST_EVENT_KEY) return NextResponse.json({ error: "Durable jobs are not configured." }, { status: 503 });
    const limit = await rateLimit(`channel-regenerate:${getRequestIdentity(request, context.workspaceId)}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: "Regeneration limit reached. Try again later." }, { status: 429 });

    const campaignId = z.uuid().parse((await params).campaignId);
    const input = z.object({ channel: channelSchema }).strict().parse(await readJsonBody(request, 2_000));
    const suppliedKey = request.headers.get("idempotency-key")?.trim();
    if (!suppliedKey || suppliedKey.length > 200) return NextResponse.json({ error: "An idempotency key is required." }, { status: 400 });
    const idempotencyKey = createHash("sha256").update(`${context.workspaceId}:${suppliedKey}`).digest("hex");
    const [existingJob] = await context.database`
      select id, status, progress, campaign_id
      from public.jobs
      where workspace_id = ${context.workspaceId} and idempotency_key = ${idempotencyKey}
      limit 1
    `;
    if (existingJob) return NextResponse.json({ job: existingJob }, { status: 202 });

    const [campaign] = await context.database`
      select project_id from public.campaigns
      where id = ${campaignId}::uuid and workspace_id = ${context.workspaceId}
      limit 1
    `;
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const [project] = await context.database`
      select id from public.projects
      where id = ${campaign.project_id}::uuid and workspace_id = ${context.workspaceId}
        and status = 'active' and active_slot is not null
        and active_slot <= ${context.limits.activeProjects}
      limit 1
    `;
    if (!project) return NextResponse.json({ error: "This campaign's project is read-only on your current plan." }, { status: 403 });

    const [reservation] = await context.database`
      select * from public.reserve_channel_regeneration(
        ${context.workspaceId}::uuid,
        ${project.id}::uuid,
        ${campaignId}::uuid,
        ${input.channel},
        ${randomUUID()}::uuid,
        ${idempotencyKey},
        ${context.limits.regenerationsPerChannel}
      )
    `;
    if (!reservation?.allowed) return NextResponse.json({ error: "No regeneration allowance remains for this channel, or the campaign is not ready." }, { status: 403 });
    if (!reservation.created) return NextResponse.json({ job: { id: reservation.job_id, status: reservation.status, progress: reservation.progress, campaign_id: reservation.campaign_id } }, { status: 202 });

    return NextResponse.json({ job: { id: reservation.job_id, status: reservation.status, progress: reservation.progress, campaign_id: reservation.campaign_id } }, { status: 202 });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Channel regeneration failed." }, { status });
  }
}
