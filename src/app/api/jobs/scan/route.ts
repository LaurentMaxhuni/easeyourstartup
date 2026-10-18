import { createHash, randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { parsePublicHttpUrl } from "@/lib/server/url-security";

export const runtime = "nodejs";

const inputSchema = z.object({
  url: z.string().min(1).max(2048),
  projectName: z.string().min(1).max(120),
  projectId: z.uuid().optional(),
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
    const limit = await rateLimit(`job-scan:${getRequestIdentity(request, context.workspaceId)}`, {
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Scan limit reached." }, { status: 429 });
    }

    const input = inputSchema.parse(await readJsonBody(request, 16_000));
    const safeUrl = parsePublicHttpUrl(input.url).toString();
    const suppliedKey = request.headers.get("idempotency-key")?.trim();
    if (!suppliedKey || suppliedKey.length > 200) {
      return NextResponse.json({ error: "An idempotency key is required for website scans." }, { status: 400 });
    }
    const idempotencyKey = createHash("sha256").update(`${context.workspaceId}:${suppliedKey}`).digest("hex");
    const [result] = await context.database`
      select * from public.enqueue_scan_job(
        ${context.workspaceId}::uuid,
        ${input.projectId ?? null}::uuid,
        ${input.projectName},
        ${safeUrl},
        ${context.limits.activeProjects},
        ${randomUUID()}::uuid,
        ${idempotencyKey},
        ${randomUUID()}::uuid
      )
    `;
    if (!result?.allowed) {
      return NextResponse.json(
        { error: input.projectId ? "Project not found or read-only." : "Active project limit reached." },
        { status: 403 },
      );
    }
    if (typeof result.job_id !== "string" || typeof result.project_id !== "string") {
      return NextResponse.json({ error: "The scan could not be queued. Retry the scan." }, { status: 503 });
    }
    // Use the persisted event ID; cron can safely retry if immediate delivery fails.
    after(async () => {
      try {
        const [entry] = await context.database`
          select event_id, event_payload from public.job_outbox
          where job_id = ${result.job_id}::uuid
            and workspace_id = ${context.workspaceId}::uuid
            and event_name = 'campaign/scan.requested'
            and delivered_at is null and dead_lettered_at is null
          limit 1
        `;
        if (typeof entry?.event_id !== "string") return;
        const payload = z.object({ jobId: z.string(), workspaceId: z.string(), projectId: z.string(), url: z.string() })
          .parse(typeof entry.event_payload === "string" ? JSON.parse(entry.event_payload) : entry.event_payload);
        await inngest.send({
          id: entry.event_id,
          name: "campaign/scan.requested",
          data: payload,
        });
        await context.database`
          select public.mark_job_outbox_delivered(${entry.event_id}::uuid)
        `;
      } catch {
        console.error("[scan] Immediate dispatch unavailable; durable dispatch will retry.");
      }
    });
    return NextResponse.json({
      job: { id: result.job_id, status: result.status, progress: result.progress },
      projectId: result.project_id,
    }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scan job could not be queued.";
    const status =
      error instanceof AuthenticationRequiredError ? error.status
        : message.startsWith("Account deletion is pending.") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
