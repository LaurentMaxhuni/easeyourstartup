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

    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const periodKey = periodStart.toISOString().slice(0, 10);
    const periodEndKey = periodEnd.toISOString().slice(0, 10);

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

    const jobId = randomUUID();
    const [job] = await context.database`
      with reserved as (
        insert into public.usage_periods (
          workspace_id,
          period_start,
          period_end,
          completed_campaigns,
          reserved_campaigns
        )
        values (
          ${context.workspaceId},
          ${periodKey},
          ${periodEndKey},
          0,
          1
        )
        on conflict (workspace_id, period_start)
        do update set
          reserved_campaigns = public.usage_periods.reserved_campaigns + 1,
          updated_at = now()
        where
          public.usage_periods.completed_campaigns +
          public.usage_periods.reserved_campaigns <
          ${context.limits.campaignsPerPeriod}
        returning workspace_id
      ),
      created_campaign as (
        insert into public.campaigns (
          workspace_id,
          project_id,
          kind,
          title,
          status,
          generation_input,
          selected_angle,
          launch_date,
          usage_reserved
        )
        select
          ${context.workspaceId},
          ${input.projectId},
          ${campaign.kind},
          ${campaign.updateDetails.slice(0, 180)},
          'queued',
          ${JSON.stringify(campaign)}::jsonb,
          ${campaign.angle ? JSON.stringify(campaign.angle) : null}::jsonb,
          ${campaign.launchDate || null},
          true
        from reserved
        returning id
      )
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
      select
        ${jobId},
        ${context.workspaceId},
        ${input.projectId},
        created_campaign.id,
        'generate',
        'queued',
        0,
        ${idempotencyKey}
      from created_campaign
      returning id, status, progress, campaign_id
    `;
    if (!job || typeof job.campaign_id !== "string") {
      return NextResponse.json(
        { error: "Campaign quota reached for this billing period." },
        { status: 403 },
      );
    }
    const campaignId = job.campaign_id;

    try {
      await inngest.send({
        name: "campaign/generation.requested",
        data: {
          jobId: job.id,
          workspaceId: context.workspaceId,
          campaignId,
        },
      });
    } catch (error) {
      await context.database`
        select public.release_campaign_usage_reservation(
          ${context.workspaceId},
          ${campaignId}
        )
      `;
      await context.database`
        update public.jobs
        set status = 'failed', error_message = 'The campaign job could not be sent.', updated_at = now()
        where id = ${job.id} and workspace_id = ${context.workspaceId}
      `;
      throw error;
    }
    return NextResponse.json(
      { job, campaignId },
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
