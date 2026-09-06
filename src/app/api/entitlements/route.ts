import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { canExportLaunchKit, getRemainingCampaigns } from "@/lib/entitlements";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const [usage] = await context.database`
      select completed_campaigns, reserved_campaigns
      from public.usage_periods
      where workspace_id = ${context.workspaceId}
        and period_start = pg_catalog.date_trunc('month', pg_catalog.now())::date
      limit 1
    `;
    const campaignsUsed = Number(usage?.completed_campaigns ?? 0);
    const campaignsReserved = Number(usage?.reserved_campaigns ?? 0);
    return NextResponse.json(
      {
        plan: context.plan,
        limits: context.limits,
        canExportLaunchKit: canExportLaunchKit(context.plan),
        campaignsUsed,
        campaignsReserved,
        campaignsRemaining: getRemainingCampaigns(
          context.plan,
          campaignsUsed,
          campaignsReserved,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Plan access is unavailable.";
    return NextResponse.json(
      { error: message },
      {
        status:
          error instanceof AuthenticationRequiredError ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
