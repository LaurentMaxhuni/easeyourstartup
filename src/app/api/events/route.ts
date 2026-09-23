import { NextResponse } from "next/server";
import { z } from "zod";
import { channelSchema } from "@/lib/contracts";
import { rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const eventSchema = z.object({
  event: z.enum([
    "scan_started",
    "scan_completed",
    "scan_failed",
    "claims_approved",
    "generation_started",
    "generation_completed",
    "generation_failed",
    "export_started",
    "export_completed",
    "export_failed",
  ]),
  properties: z
    .object({
      channel: channelSchema.optional(),
      channelCount: z.number().int().min(0).max(9).optional(),
      sourcePageCount: z.number().int().min(0).max(6).optional(),
      approvedClaimCount: z.number().int().min(0).max(30).optional(),
      outputCount: z.number().int().min(0).max(9).optional(),
      warningCount: z.number().int().min(0).max(30).optional(),
      durationMs: z.number().int().min(0).max(3_600_000).optional(),
      mode: z.enum(["durable", "direct", "demo"]).optional(),
      format: z.enum(["png", "zip"]).optional(),
    })
    .strict()
    .default({}),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const limit = await rateLimit(
      `studio-events:${context.workspaceId}:${context.user.id}`,
      { limit: 120, windowMs: 60 * 60 * 1000 },
    );
    if (!limit.allowed) return new NextResponse(null, { status: 204 });
    const input = eventSchema.parse(await readJsonBody(request, 4_000));
    await context.database`
      insert into public.audit_events (
        workspace_id,
        actor_user_id,
        event_type,
        external_event_id,
        payload
      )
      values (
        ${context.workspaceId},
        ${context.user.id},
        ${`studio.${input.event}`},
        null,
        ${JSON.stringify(input.properties)}::jsonb
      )
    `;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event was not recorded.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
