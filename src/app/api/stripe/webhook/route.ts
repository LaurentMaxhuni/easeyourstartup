import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/server/stripe";
import { createDatabase, type DatabaseClient } from "@/lib/server/database";

export const runtime = "nodejs";

async function workspaceForUser(database: DatabaseClient, userId: string) {
  const [membership] = await database`
    select workspace_id
    from public.memberships
    where user_id = ${userId}
    order by created_at asc
    limit 1
  `;
  return typeof membership?.workspace_id === "string"
    ? membership.workspace_id
    : null;
}

function asString(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function syncSubscription(
  database: DatabaseClient,
  subscription: Stripe.Subscription,
) {
  const userId = subscription.metadata.neon_user_id;
  if (!userId) return;
  const workspaceId = await workspaceForUser(database, userId);
  if (!workspaceId) return;

  const item = subscription.items.data[0];
  const customerId = asString(subscription.customer);
  const periodStart = item
    ? new Date(item.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = item
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
  await database`
    insert into public.subscriptions (
      workspace_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    values (
      ${workspaceId},
      ${customerId},
      ${subscription.id},
      ${item?.price.id ?? null},
      ${subscription.status},
      ${periodStart},
      ${periodEnd},
      ${subscription.cancel_at_period_end}
    )
    on conflict (workspace_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = now()
  `;
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret || !signature) {
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  const database = createDatabase();
  if (!database) {
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 503 },
    );
  }

  const [existing] = await database`
    select id
    from public.audit_events
    where external_event_id = ${event.id}
    limit 1
  `;
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(
          database,
          event.data.object as Stripe.Subscription,
        );
        break;
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = asString(session.subscription);
        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(database, subscription);
        }
        break;
      }
      default:
        break;
    }

    await database`
      insert into public.audit_events (
        workspace_id,
        actor_user_id,
        event_type,
        external_event_id,
        payload
      )
      values (
        null,
        null,
        ${`stripe.${event.type}`},
        ${event.id},
        ${JSON.stringify({ livemode: event.livemode, created: event.created })}::jsonb
      )
    `;
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
