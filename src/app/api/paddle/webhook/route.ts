import { NextResponse } from "next/server";
import {
  createDatabase,
  type DatabaseClient,
} from "@/lib/server/database";
import { verifyPaddleWebhookSignature } from "@/lib/server/paddle";
import { readBoundedBody } from "@/lib/server/request-security";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaddleSubscription = {
  id: string;
  customerId: string;
  status: string;
  customData: JsonRecord;
  priceId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asIsoDate(value: unknown) {
  const stringValue = asString(value);
  if (!stringValue) return null;
  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function parseSubscription(value: unknown): PaddleSubscription | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const customerId = asString(value.customer_id);
  const status = asString(value.status);
  if (!id || !customerId || !status) return null;

  const currentPeriod = isRecord(value.current_billing_period)
    ? value.current_billing_period
    : null;
  const scheduledChange = isRecord(value.scheduled_change)
    ? value.scheduled_change
    : null;
  const items = Array.isArray(value.items) ? value.items : [];
  const firstItem = items.find(isRecord);
  const price = firstItem && isRecord(firstItem.price) ? firstItem.price : null;

  return {
    id,
    customerId,
    status,
    customData: isRecord(value.custom_data) ? value.custom_data : {},
    priceId: price ? asString(price.id) : null,
    periodStart: currentPeriod ? asIsoDate(currentPeriod.starts_at) : null,
    periodEnd: currentPeriod ? asIsoDate(currentPeriod.ends_at) : null,
    cancelAtPeriodEnd: scheduledChange?.action === "cancel",
  };
}

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

async function workspaceForSubscription(
  database: DatabaseClient,
  customData: JsonRecord,
) {
  const userId = asString(customData.neon_user_id);
  const workspaceId = asString(customData.workspace_id);

  if (userId && workspaceId) {
    const [membership] = await database`
      select workspace_id
      from public.memberships
      where workspace_id = ${workspaceId}
        and user_id = ${userId}
      limit 1
    `;
    if (membership?.workspace_id === workspaceId) return workspaceId;
  }

  return userId ? workspaceForUser(database, userId) : workspaceId;
}

export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("paddle-signature");
  if (!secret || !signature) {
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  }

  let payload: string;
  try {
    const bytes = await readBoundedBody(request, 1_000_000);
    payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return NextResponse.json({ error: "Webhook body is too large or invalid." }, { status: 413 });
  }
  if (!verifyPaddleWebhookSignature(payload, signature, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  let event: JsonRecord;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed)) throw new Error("Invalid webhook payload.");
    event = parsed;
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  const eventId = asString(event.event_id) ?? asString(event.notification_id);
  const eventType = asString(event.event_type);
  const occurredAt = asIsoDate(event.occurred_at);
  if (!eventId || !eventType || !occurredAt) {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
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

  try {
    const subscription = eventType.startsWith("subscription.")
      ? parseSubscription(event.data)
      : null;
    const workspaceId = subscription
      ? await workspaceForSubscription(database, subscription.customData)
      : null;
    const eventData = isRecord(event.data) ? event.data : null;
    const eventCustomData = subscription?.customData ?? (
      eventData && isRecord(eventData.custom_data) ? eventData.custom_data : {}
    );
    const checkoutAttemptIdValue = asString(eventCustomData.checkout_attempt_id);
    const checkoutAttemptId = isUuid(checkoutAttemptIdValue) ? checkoutAttemptIdValue : null;
    const checkoutWorkspaceValue = subscription
      ? workspaceId
      : asString(eventCustomData.workspace_id);
    const checkoutWorkspaceId = isUuid(checkoutWorkspaceValue)
      ? checkoutWorkspaceValue
      : null;
    const checkoutCompleted = eventType === "transaction.completed" ||
      subscription?.status === "active" || subscription?.status === "trialing";
    const checkoutFailed = eventType === "transaction.canceled";
    const foundingPriceId = process.env.PADDLE_FOUNDING_PRICE_ID?.trim() ?? null;
    const [receipt] = await database`
      with receipt as (
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
        ${`paddle.${eventType}`},
        ${eventId},
        ${JSON.stringify({
          event_type: eventType,
          occurred_at: asString(event.occurred_at),
        })}::jsonb
      )
      on conflict (external_event_id) do nothing
      returning id
      ), subscription_update as (
        insert into public.subscriptions (
          workspace_id,
          billing_provider,
          billing_customer_id,
          billing_subscription_id,
          billing_price_id,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          last_event_occurred_at
        )
        select
          ${workspaceId}::uuid,
          'paddle',
          ${subscription?.customerId ?? null}::text,
          ${subscription?.id ?? null}::text,
          ${subscription?.priceId ?? null}::text,
          ${subscription?.status ?? null}::text,
          ${subscription?.periodStart ?? null}::timestamptz,
          ${subscription?.periodEnd ?? null}::timestamptz,
          ${subscription?.cancelAtPeriodEnd ?? false},
          ${occurredAt}::timestamptz
        from receipt
        where ${workspaceId}::uuid is not null
        on conflict (workspace_id) do update set
          billing_provider = 'paddle',
          billing_customer_id = excluded.billing_customer_id,
          billing_subscription_id = excluded.billing_subscription_id,
          billing_price_id = excluded.billing_price_id,
          status = excluded.status,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          last_event_occurred_at = excluded.last_event_occurred_at,
          updated_at = pg_catalog.now()
        where public.subscriptions.last_event_occurred_at is null
          or public.subscriptions.last_event_occurred_at <= excluded.last_event_occurred_at
        returning workspace_id, status, billing_price_id
      ), founding_redemption as (
        update public.founding_slots slot
        set redeemed_at = coalesce(slot.redeemed_at, pg_catalog.now())
        from subscription_update subscription
        where slot.workspace_id = subscription.workspace_id
          and subscription.status in ('active', 'trialing')
          and ${foundingPriceId}::text is not null
          and subscription.billing_price_id = ${foundingPriceId}::text
        returning slot.slot
      ), checkout_attempt_update as (
        update public.checkout_attempts attempt
        set status = case when ${checkoutCompleted} then 'completed' else 'failed' end,
          expires_at = pg_catalog.now(), updated_at = pg_catalog.now()
        from receipt
        where attempt.workspace_id = ${checkoutWorkspaceId}::uuid
          and attempt.attempt_id = ${checkoutAttemptId}::uuid
          and attempt.status <> 'completed'
          and (${checkoutCompleted} or ${checkoutFailed})
        returning attempt.workspace_id
      )
      select id from receipt
    `;
    return NextResponse.json({ received: true, duplicate: !receipt });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
