import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripeClient } from "@/lib/server/stripe";
import { createDatabase } from "@/lib/server/database";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin } from "@/lib/server/request-security";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = rateLimit(`checkout:${getRequestIdentity(request)}`, {
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Checkout limit reached." },
        { status: 429 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in before checkout.", loginUrl: "/login?next=/pricing" },
        { status: 401 },
      );
    }
    const stripe = getStripeClient();
    const price = process.env.STRIPE_PRO_PRICE_ID;
    const database = createDatabase();
    if (!stripe || !price || !database) {
      return NextResponse.json(
        { error: "Billing is not configured in this environment." },
        { status: 503 },
      );
    }
    const workspaceId = await ensureWorkspaceForUser(
      database,
      user.id,
      user.name?.trim() || `${user.email?.split("@")[0] ?? "My"} workspace`,
    );

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: absoluteUrl("/studio?demo=1&checkout=success"),
        cancel_url: absoluteUrl("/pricing?checkout=cancelled"),
        customer_email: user.email ?? undefined,
        allow_promotion_codes: true,
        client_reference_id: user.id,
        metadata: { neon_user_id: user.id, workspace_id: workspaceId },
        subscription_data: {
          metadata: { neon_user_id: user.id, workspace_id: workspaceId },
        },
      },
      {
        idempotencyKey: `checkout:${user.id}:${new Date()
          .toISOString()
          .slice(0, 13)}`,
      },
    );
    if (!session.url) throw new Error("Checkout URL was not created.");
    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Checkout could not be started." },
      { status: 400 },
    );
  }
}
