import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

const blockingMessages: Record<string, string> = {
  subscription_must_end:
    "Cancel your subscription in billing settings and wait until the paid period ends before deleting your account.",
  checkout_must_finish:
    "A payment is still being confirmed. Wait for billing status to update, then try again.",
  jobs_must_finish:
    "Wait for scans and generation jobs to finish before deleting your account.",
  account_not_in_workspace: "Your account workspace could not be verified.",
  workspace_is_shared:
    "This workspace has another member. Ask the workspace owner to transfer ownership before deleting this account.",
};

export async function GET() {
  try {
    const context = await requireWorkspaceContext();
    const [request] = await context.database`
      select expires_at
      from public.account_deletion_requests
      where user_id = ${context.user.id}::uuid
        and workspace_id = ${context.workspaceId}::uuid
        and expires_at > pg_catalog.now()
      limit 1
    `;
    return NextResponse.json({
      pending: Boolean(request),
      expiresAt: request?.expires_at ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json({ error: status === 401 ? "Sign in again to check account deletion." : "Account deletion status is temporarily unavailable." }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const [result] = await context.database`
      select * from public.prepare_account_deletion(
        ${context.user.id}::text,
        ${context.workspaceId}::uuid
      )
    `;
    if (result?.allowed !== true) {
      const reason = typeof result?.reason === "string" ? result.reason : "account_not_in_workspace";
      return NextResponse.json({
        error: blockingMessages[reason] ?? "Account deletion could not be prepared.",
        ...(reason === "subscription_must_end" ? { manageUrl: "/settings/billing" } : {}),
      }, { status: reason === "account_not_in_workspace" ? 403 : 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json({ error: status === 401 ? "Sign in again to delete your account." : "Account deletion is temporarily unavailable." }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    await context.database`
      delete from public.account_deletion_requests
      where user_id = ${context.user.id}::uuid
        and workspace_id = ${context.workspaceId}::uuid
    `;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json({ error: status === 401 ? "Sign in again to cancel account deletion." : "Account deletion could not be cancelled." }, { status });
  }
}
