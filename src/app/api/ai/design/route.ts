import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { creativeDesignRequestSchema } from "@/lib/contracts";
import { designCreativeComposition } from "@/lib/server/campaign-generator";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 180;

const scopedDesignRequestSchema = creativeDesignRequestSchema.extend({
  projectId: z.uuid(),
  campaignId: z.uuid(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();

    const limit = await rateLimit(`ai-design:${getRequestIdentity(request, context.workspaceId)}`, {
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "AI design limit reached. Try again later." },
        { status: 429 },
      );
    }

    const { projectId, campaignId, ...input } = scopedDesignRequestSchema.parse(
      await readJsonBody(request, 64_000),
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
    const generation = await designCreativeComposition(input);
    return NextResponse.json({ ...generation, mode: "ai" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI design failed.";
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (message.startsWith("AI design is not configured")) {
      return NextResponse.json({ error: "AI design is not configured in this environment." }, { status: 503 });
    }
    if (message.startsWith("The AI provider could not design this canvas")) {
      return NextResponse.json({ error: "AI design failed temporarily. Your saved campaign is unchanged." }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
