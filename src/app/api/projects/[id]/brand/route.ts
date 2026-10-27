import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { brandProfileSchema } from "@/lib/contracts";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const updateBrandSchema = z.object({
  brand: brandProfileSchema.optional(),
  captureAssetId: z.uuid().optional(),
}).strict().refine((value) => value.brand !== undefined || value.captureAssetId !== undefined);

/** Saves brand edits and the stored website screenshot on a scanned project. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const projectId = z.uuid().parse((await params).id);
    const parsed = updateBrandSchema.safeParse(await readJsonBody(request, 256_000));
    if (!parsed.success) return NextResponse.json({ error: "Brand details are invalid." }, { status: 400 });
    const { brand, captureAssetId } = parsed.data;
    const [updated] = await context.database`
      update public.brand_profiles bp
      set profile = coalesce(${brand ? JSON.stringify(brand) : null}::jsonb, bp.profile),
        capture_asset_id = coalesce(${captureAssetId ?? null}::uuid, bp.capture_asset_id),
        version = bp.version + 1,
        updated_at = now()
      from public.projects p
      where bp.project_id = p.id
        and bp.workspace_id = p.workspace_id
        and p.id = ${projectId}::uuid
        and p.workspace_id = ${context.workspaceId}
        and p.status = 'active'
        and p.active_slot between 1 and ${context.limits.activeProjects}
        and (${captureAssetId ?? null}::uuid is null or exists (
          select 1 from public.stored_assets a
          where a.id = ${captureAssetId ?? null}::uuid
            and a.project_id = p.id
            and a.workspace_id = p.workspace_id
        ))
      returning bp.version
    `;
    if (!updated) return NextResponse.json({ error: "Scanned project not found or read-only." }, { status: 404 });
    return NextResponse.json({ version: updated.version });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required." }, { status: error.status });
    }
    return NextResponse.json({ error: "Brand details could not be saved." }, { status: 400 });
  }
}
