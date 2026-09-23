import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { creativeRewriteSchema } from "@/lib/contracts";
import { rewriteCreativeText } from "@/lib/server/campaign-generator";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

const scopedRewriteRequestSchema = creativeRewriteSchema.extend({
  projectId: z.uuid(),
  campaignId: z.uuid(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();

    const limit = await rateLimit(`ai-rewrite:${getRequestIdentity(request, context.workspaceId)}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "AI rewrite limit reached. Try again later." },
        { status: 429 },
      );
    }

    const { projectId, campaignId, ...input } = scopedRewriteRequestSchema.parse(
      await readJsonBody(request, 12_000),
    );
    const [ownedProject] = await context.database`
      select p.id
      from public.projects p
      where p.id = ${projectId}::uuid
        and p.workspace_id = ${context.workspaceId}::uuid
        and p.status = 'active'
        and p.active_slot between 1 and ${context.limits.activeProjects}
        and exists (
          select 1 from public.campaigns c
          where c.id = ${campaignId}::uuid
            and c.project_id = p.id
            and c.workspace_id = p.workspace_id
            and c.status = 'completed'
        )
      limit 1
    `;
    if (!ownedProject) return NextResponse.json({ error: "This project is unavailable or read-only." }, { status: 403 });
    const result = await rewriteCreativeText(input);
    return NextResponse.json({ ...result, mode: "ai" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI rewrite failed.";
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (message.startsWith("AI rewriting is not configured")) {
      return NextResponse.json({ error: "AI rewriting is not configured in this environment." }, { status: 503 });
    }
    if (message.startsWith("The AI provider could not rewrite this text")) {
      return NextResponse.json({ error: "AI rewrite failed temporarily. Your campaign is unchanged." }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
