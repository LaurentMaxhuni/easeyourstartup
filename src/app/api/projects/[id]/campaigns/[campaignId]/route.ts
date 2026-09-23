import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

const updateCampaignSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  status: z.enum(["archived", "restored"]).optional(),
}).strict().refine((value) => value.title !== undefined || value.status !== undefined);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const { id, campaignId } = await params;
    const projectId = z.uuid().parse(id);
    const campaign = z.uuid().parse(campaignId);
    const input = updateCampaignSchema.parse(await readJsonBody(request, 8_000));
    const [row] = await context.database`
      update public.campaigns c
      set title = coalesce(${input.title ?? null}, c.title),
        status = case
          when ${input.status ?? null} = 'archived' then 'archived'
          when ${input.status ?? null} = 'restored' then case
            when exists (
              select 1 from public.channel_outputs o
              where o.campaign_id = c.id and o.workspace_id = c.workspace_id
            ) then 'completed'
            else 'draft'
          end
          else c.status
        end,
        updated_at = now()
      from public.projects p
      where c.id = ${campaign}::uuid
        and c.project_id = ${projectId}::uuid
        and c.workspace_id = ${context.workspaceId}
        and (
          (${input.status ?? null} = 'restored' and c.status = 'archived')
          or (${input.status ?? null} is distinct from 'restored' and c.status <> 'archived')
        )
        and p.id = c.project_id
        and p.workspace_id = c.workspace_id
        and p.status = 'active'
        and p.active_slot between 1 and ${context.limits.activeProjects}
      returning c.id, c.title, c.status, c.updated_at
    `;
    if (!row) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ campaign: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign could not be updated." }, { status: 400 });
  }
}
