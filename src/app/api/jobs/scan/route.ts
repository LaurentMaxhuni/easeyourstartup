import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
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
    const limit = rateLimit(`job-scan:${getRequestIdentity(request)}`, {
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Scan limit reached." }, { status: 429 });
    }

    const input = inputSchema.parse(await readJsonBody(request, 16_000));
    const safeUrl = parsePublicHttpUrl(input.url).toString();
    let projectId = input.projectId;

    if (!projectId) {
      const [projectCount] = await context.database`
        select count(*)::int as count
        from public.projects
        where workspace_id = ${context.workspaceId}
          and status = 'active'
      `;
      if (Number(projectCount?.count ?? 0) >= context.limits.activeProjects) {
        return NextResponse.json(
          { error: "Active project limit reached." },
          { status: 403 },
        );
      }
      const [project] = await context.database`
        insert into public.projects (workspace_id, name, public_url)
        values (${context.workspaceId}, ${input.projectName}, ${safeUrl})
        returning id
      `;
      if (!project) throw new Error("Project could not be created.");
      projectId = project.id;
    } else {
      const [project] = await context.database`
        select id
        from public.projects
        where id = ${projectId}
          and workspace_id = ${context.workspaceId}
        limit 1
      `;
      if (!project) throw new Error("Project not found.");
    }
    if (!projectId) throw new Error("Project could not be resolved.");
    const resolvedProjectId = projectId;

    const suppliedKey = request.headers.get("idempotency-key");
    const idempotencyKey =
      suppliedKey && suppliedKey.length <= 200
        ? suppliedKey
        : createHash("sha256")
            .update(
              `${context.workspaceId}:${resolvedProjectId}:${safeUrl}:${new Date()
                .toISOString()
                .slice(0, 13)}`,
            )
            .digest("hex");
    const jobId = randomUUID();
    const [job] = await context.database`
      insert into public.jobs (
        id,
        workspace_id,
        project_id,
        kind,
        status,
        progress,
        idempotency_key
      )
      values (
        ${jobId},
        ${context.workspaceId},
        ${resolvedProjectId},
        'scan',
        'queued',
        0,
        ${idempotencyKey}
      )
      on conflict (workspace_id, idempotency_key) do nothing
      returning id, status, progress
    `;
    if (!job) {
      const [existing] = await context.database`
        select id, status, progress
        from public.jobs
        where workspace_id = ${context.workspaceId}
          and idempotency_key = ${idempotencyKey}
        limit 1
      `;
      return NextResponse.json(
        { job: existing, projectId: resolvedProjectId },
        { status: 202 },
      );
    }

    await inngest.send({
      name: "campaign/scan.requested",
      data: {
        jobId: job.id,
        workspaceId: context.workspaceId,
        projectId: resolvedProjectId,
        url: safeUrl,
      },
    });
    return NextResponse.json(
      { job, projectId: resolvedProjectId },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scan job could not be queued.";
    const status =
      error instanceof AuthenticationRequiredError ? error.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
