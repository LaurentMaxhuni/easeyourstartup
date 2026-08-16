import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import {
  generateCampaignSchema,
  type GenerateCampaignInput,
} from "@/lib/contracts";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const inputSchema = z.object({
  projectId: z.uuid(),
  campaign: generateCampaignSchema,
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    if (!process.env.INNGEST_EVENT_KEY) {
      return NextResponse.json(
        { error: "Durable jobs are not configured." },
        { status: 503 },
      );
    }
    const limit = rateLimit(`job-generate:${getRequestIdentity(request)}`, {
      limit: 16,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Generation limit reached." },
        { status: 429 },
      );
    }

    const input = inputSchema.parse(await readJsonBody(request, 96_000));
    const [project] = await context.database`
      select id
      from public.projects
      where id = ${input.projectId}
        and workspace_id = ${context.workspaceId}
      limit 1
    `;
    if (!project) throw new Error("Project not found.");

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    const periodKey = periodStart.toISOString().slice(0, 10);
    const [usage] = await context.database`
      select completed_campaigns
      from public.usage_periods
      where workspace_id = ${context.workspaceId}
        and period_start = ${periodKey}
      limit 1
    `;
    if (
      (usage?.completed_campaigns ?? 0) >=
      context.limits.campaignsPerPeriod
    ) {
      return NextResponse.json(
        { error: "Campaign quota reached for this billing period." },
        { status: 403 },
      );
    }

    const campaign = input.campaign as GenerateCampaignInput;
    const suppliedKey = request.headers.get("idempotency-key");
    const idempotencyKey =
      suppliedKey && suppliedKey.length <= 200
        ? suppliedKey
        : createHash("sha256")
            .update(
              `${context.workspaceId}:${input.projectId}:${JSON.stringify(
                campaign,
              )}`,
            )
            .digest("hex");
    const [existingJob] = await context.database`
      select id, status, progress, campaign_id
      from public.jobs
      where workspace_id = ${context.workspaceId}
        and idempotency_key = ${idempotencyKey}
      limit 1
    `;
    if (existingJob) {
      return NextResponse.json(
        { job: existingJob, campaignId: existingJob.campaign_id },
        { status: 202 },
      );
    }

    const [created] = await context.database`
      insert into public.campaigns (
        workspace_id,
        project_id,
        kind,
        title,
        status,
        generation_input,
        selected_angle,
        launch_date
      )
      values (
        ${context.workspaceId},
        ${input.projectId},
        ${campaign.kind},
        ${campaign.updateDetails.slice(0, 180)},
        'queued',
        ${JSON.stringify(campaign)}::jsonb,
        ${campaign.angle ? JSON.stringify(campaign.angle) : null}::jsonb,
        ${campaign.launchDate || null}
      )
      returning id
    `;
    if (!created) throw new Error("Campaign could not be created.");

    const jobId = randomUUID();
    const [job] = await context.database`
      insert into public.jobs (
        id,
        workspace_id,
        project_id,
        campaign_id,
        kind,
        status,
        progress,
        idempotency_key
      )
      values (
        ${jobId},
        ${context.workspaceId},
        ${input.projectId},
        ${created.id},
        'generate',
        'queued',
        0,
        ${idempotencyKey}
      )
      returning id, status, progress
    `;
    if (!job) throw new Error("Generation job could not be queued.");

    await inngest.send({
      name: "campaign/generation.requested",
      data: {
        jobId: job.id,
        workspaceId: context.workspaceId,
        campaignId: created.id,
      },
    });
    return NextResponse.json(
      { job, campaignId: created.id },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Generation job could not be queued.";
    const status =
      error instanceof AuthenticationRequiredError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
