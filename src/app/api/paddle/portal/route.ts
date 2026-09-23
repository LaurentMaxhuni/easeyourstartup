import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getPaddleConfig,
  paddleRequest,
  type PaddlePortalSession,
} from "@/lib/server/paddle";
import { createDatabase } from "@/lib/server/database";
import { assertSameOrigin } from "@/lib/server/request-security";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const paddle = getPaddleConfig();
    const database = createDatabase();
    if (!paddle || !database) {
      return NextResponse.json(
        { error: "Billing is not configured." },
        { status: 503 },
      );
    }

    const workspaceId = await ensureWorkspaceForUser(
      database,
      user.id,
      user.name?.trim() || `${user.email?.split("@")[0] ?? "My"} workspace`,
    );
    const [subscription] = await database`
      select billing_customer_id
      from public.subscriptions
      where workspace_id = ${workspaceId}
        and billing_provider = 'paddle'
      limit 1
    `;
    if (!subscription?.billing_customer_id) {
      return NextResponse.json(
        { error: "No Paddle customer found." },
        { status: 404 },
      );
    }

    const portal = await paddleRequest<PaddlePortalSession>(
      `/customers/${encodeURIComponent(subscription.billing_customer_id)}/portal-sessions`,
      { method: "POST" },
    );
    const url = portal.data.urls?.general?.overview;
    if (!url) throw new Error("Paddle portal URL was not created.");
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Customer portal could not be opened." },
      { status: 400 },
    );
  }
}
