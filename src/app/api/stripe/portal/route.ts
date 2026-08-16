import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripeClient } from "@/lib/server/stripe";
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
    const stripe = getStripeClient();
    const database = createDatabase();
    if (!stripe || !database) {
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
      select stripe_customer_id
      from public.subscriptions
      where workspace_id = ${workspaceId}
      limit 1
    `;
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer found." },
        { status: 404 },
      );
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: absoluteUrl("/pricing"),
    });
    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json(
      { error: "Customer portal could not be opened." },
      { status: 400 },
    );
  }
}
