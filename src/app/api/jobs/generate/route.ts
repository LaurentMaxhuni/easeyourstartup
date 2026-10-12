import { createHash, randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import {
  generateCampaignSchema,
  type GenerateCampaignInput,
} from "@/lib/contracts";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { inngest } from "@/inngest/client";

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
    const limit = await rateLimit(`job-generate:${getRequestIdentity(request, context.workspaceId)}`, {
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
    const campaign = input.campaign as GenerateCampaignInput;
    const storedGenerationInput = process.env.GENERATION_VERSION?.trim().toLowerCase() === "v2"
      ? { generatorVersion: "v2", brief: campaign }
      : campaign;
    const suppliedKey = request.headers.get("idempotency-key")?.trim();
    if (!suppliedKey || suppliedKey.length > 200) {
      return NextResponse.json({ error: "An idempotency key is required for campaign generation." }, { status: 400 });
    }
    const idempotencyKey = createHash("sha256").update(`${context.workspaceId}:${suppliedKey}`).digest("hex");
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

    const [project] = await context.database`
      select id, status, active_slot
      from public.projects
      where id = ${input.projectId}::uuid
        and workspace_id = ${context.workspaceId}::uuid
      limit 1
    `;
    if (!project) {
      return NextResponse.json(
        { error: "This project could not be found in your workspace. Reopen it from the dashboard and try again." },
        { status: 404 },
      );
    }
    if (project.status !== "active") {
      return NextResponse.json(
        { error: "This project is archived. Restore it before creating posts." },
        { status: 409 },
      );
    }
    const activeSlot = Number(project.active_slot);
    if (!Number.isInteger(activeSlot) || activeSlot < 1 || activeSlot > context.limits.activeProjects) {
      return NextResponse.json(
        { error: "This project is outside this workspace’s current active-project limit. Check Billing to confirm the plan attached to this workspace before changing plans." },
        { status: 403 },
      );
    }

    const periodKey = context.usagePeriodStart;
    const periodEndKey = context.usagePeriodEnd;

    const jobId = randomUUID();
    const eventId = randomUUID();
    const [job] = await context.database`
      with idempotency_lock as materialized (
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(${context.workspaceId}::text || ':' || ${idempotencyKey}, 0)
        ) as locked
      ),
      existing_job as materialized (
        select j.id, j.status, j.progress, j.campaign_id
        from public.jobs j
        cross join idempotency_lock
        where j.workspace_id = ${context.workspaceId}::uuid
          and j.idempotency_key = ${idempotencyKey}
        limit 1
      ),
      active_project as materialized (
        select p.id
        from public.projects p
        cross join idempotency_lock
        where p.id = ${input.projectId}::uuid
          and p.workspace_id = ${context.workspaceId}::uuid
          and p.status = 'active'
          and p.active_slot between 1 and ${context.limits.activeProjects}
        for update of p
      ),
      reserved as (
        insert into public.usage_periods (
          workspace_id,
          period_start,
          period_end,
          completed_campaigns,
          reserved_campaigns
        )
        select
          ${context.workspaceId},
          ${periodKey},
          ${periodEndKey},
          0,
          1
        from active_project
        where not exists (select 1 from existing_job)
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
          usage_reserved,
          usage_period_start,
          usage_period_end
        )
        select
          ${context.workspaceId},
          ${input.projectId},
          ${campaign.kind},
          ${campaign.updateDetails.slice(0, 180)},
          'queued',
          ${JSON.stringify(storedGenerationInput)}::jsonb,
          ${campaign.angle ? JSON.stringify(campaign.angle) : null}::jsonb,
          ${campaign.launchDate || null},
          true,
          ${periodKey},
          ${periodEndKey}
        from reserved cross join active_project
        returning id
      ),
      created_job as (
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
      ),
      queued_event as (
        insert into public.job_outbox (
          event_id, workspace_id, job_id, event_name, event_payload
        )
        select
          ${eventId}::uuid,
          ${context.workspaceId}::uuid,
          created_job.id,
          'campaign/generation.requested',
          pg_catalog.jsonb_build_object(
            'jobId', created_job.id,
            'workspaceId', ${context.workspaceId}::uuid,
            'campaignId', created_job.campaign_id
          )
        from created_job
        returning job_id
      )
      select created_job.id, created_job.status, created_job.progress, created_job.campaign_id
      from created_job
      join queued_event on queued_event.job_id = created_job.id
      union all
      select existing_job.id, existing_job.status, existing_job.progress, existing_job.campaign_id
      from existing_job
    `;
    if (!job || typeof job.campaign_id !== "string") {
      return NextResponse.json(
        { error: "Campaign quota reached for this billing period." },
        { status: 403 },
      );
    }
    const campaignId = job.campaign_id;

    // Send the persisted event immediately; cron remains the recovery path.
    // Reuse its ID so a concurrent dispatcher cannot start a second campaign.
    after(async () => {
      try {
        const [entry] = await context.database`
          select event_id
          from public.job_outbox
          where job_id = ${job.id}::uuid
            and workspace_id = ${context.workspaceId}::uuid
            and event_name = 'campaign/generation.requested'
            and delivered_at is null
            and dead_lettered_at is null
          limit 1
        `;
        if (typeof entry?.event_id !== "string") return;
        await inngest.send({
          id: entry.event_id,
          name: "campaign/generation.requested",
          data: { jobId: job.id, workspaceId: context.workspaceId, campaignId },
        });
        await context.database`
          select public.mark_job_outbox_delivered(${entry.event_id}::uuid)
        `;
      } catch {
        console.error("[campaign-generation] Immediate dispatch unavailable; durable dispatch will retry.");
      }
    });

    return NextResponse.json(
      { job, campaignId },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Check the project and campaign details and try again." },
        { status: 400 },
      );
    }
    if (error instanceof Error) {
      if (error.message.startsWith("Account deletion is pending.")) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message === "Cross-site request rejected." || error.message === "Request origin rejected.") {
        return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
      }
      if (error.message === "Request body must be valid JSON.") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === "Request body is too large.") {
        return NextResponse.json({ error: error.message }, { status: 413 });
      }
    }
    console.error("[campaign-generation] Could not queue generation job.", error);
    return NextResponse.json(
      { error: "Campaign generation could not be queued. Please try again." },
      { status: 503 },
    );
  }
}
