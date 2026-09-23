import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/server";
import {
  getPaddleConfig,
  paddleRequest,
  type PaddleTransaction,
} from "@/lib/server/paddle";
import { createDatabase } from "@/lib/server/database";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin } from "@/lib/server/request-security";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const limit = await rateLimit(`checkout:${getRequestIdentity(request)}`, {
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

    const paddle = getPaddleConfig();
    const database = createDatabase();
    if (!paddle || !database) {
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
    const [deletionRequest] = await database`
      select user_id from public.account_deletion_requests
      where user_id = ${user.id} and expires_at > pg_catalog.now()
      limit 1
    `;
    if (deletionRequest) {
      return NextResponse.json(
        { error: "Account deletion is in progress. Reopen account settings if it was interrupted." },
        { status: 409 },
      );
    }
    const workspaceLimit = await rateLimit(`checkout:${getRequestIdentity(request, workspaceId)}`, {
      limit: 4,
      windowMs: 60 * 60 * 1000,
    });
    if (!workspaceLimit.allowed) return NextResponse.json({ error: "Checkout limit reached." }, { status: 429 });
    const [existingSubscription] = await database`
      select status
      from public.subscriptions
      where workspace_id = ${workspaceId}
        and billing_provider = 'paddle'
        and status in ('active', 'trialing', 'past_due')
      limit 1
    `;
    if (existingSubscription) {
      return NextResponse.json(
        { error: "Your workspace already has a subscription. Manage it from billing settings.", manageUrl: "/settings/billing" },
        { status: 409 },
      );
    }
    const [foundingSlot] = await database`
      select slot
      from public.founding_slots
      where workspace_id = ${workspaceId}
        and redeemed_at is null
      limit 1
    `;
    const founding = Boolean(foundingSlot);
    const price = (founding
      ? process.env.PADDLE_FOUNDING_PRICE_ID
      : process.env.PADDLE_PRO_PRICE_ID)?.trim();
    if (!price) {
      return NextResponse.json(
        { error: founding ? "The founding price is not configured." : "The Pro price is not configured." },
        { status: 503 },
      );
    }

    const attemptId = randomUUID();
    const [attempt] = await database`
      with lifecycle_lock as materialized (
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(${workspaceId}::text || ':account-lifecycle', 0)
        ) as locked
      ), claimed_attempt as (
        insert into public.checkout_attempts (
          workspace_id, attempt_id, billing_price_id, status, expires_at
        )
        select
          ${workspaceId}::uuid, ${attemptId}::uuid, ${price}, 'creating',
          pg_catalog.now() + interval '10 minutes'
        from lifecycle_lock
        where not exists (
          select 1 from public.account_deletion_requests r
          where r.user_id = ${user.id} and r.expires_at > pg_catalog.now()
        )
        on conflict (workspace_id) do update set
          attempt_id = excluded.attempt_id,
          paddle_transaction_id = null,
          billing_price_id = excluded.billing_price_id,
          checkout_url = null,
          status = 'creating',
          expires_at = excluded.expires_at,
          updated_at = pg_catalog.now()
        where public.checkout_attempts.status = 'failed'
          or (public.checkout_attempts.status in ('creating', 'pending')
            and public.checkout_attempts.expires_at <= pg_catalog.now())
        returning attempt_id, paddle_transaction_id, billing_price_id,
          checkout_url, status, (attempt_id = ${attemptId}::uuid) as claimed
      )
      select attempt_id::text, paddle_transaction_id, billing_price_id,
        checkout_url, status, claimed
      from claimed_attempt
      union all
      select existing.attempt_id::text, existing.paddle_transaction_id,
        existing.billing_price_id, existing.checkout_url, existing.status, false
      from public.checkout_attempts existing
      where existing.workspace_id = ${workspaceId}::uuid
        and not exists (select 1 from claimed_attempt)
      limit 1
    `;
    if (!attempt) {
      const [pendingDeletion] = await database`
        select user_id from public.account_deletion_requests
        where user_id = ${user.id} and expires_at > pg_catalog.now()
        limit 1
      `;
      return NextResponse.json(
        { error: pendingDeletion ? "Account deletion is in progress." : "Checkout could not be prepared." },
        { status: pendingDeletion ? 409 : 503 },
      );
    }
    if (attempt.status === "completed") {
      return NextResponse.json(
        { error: "Payment is being confirmed. Your Pro access will appear shortly.", manageUrl: "/settings/billing" },
        { status: 409 },
      );
    }
    if (attempt.claimed !== true) {
      if (attempt.status === "pending" && typeof attempt.checkout_url === "string") {
        return NextResponse.json({ url: attempt.checkout_url, reused: true });
      }
      return NextResponse.json(
        { error: "A checkout is already being prepared. Wait a moment and try again." },
        { status: 409 },
      );
    }

    let transaction: Awaited<ReturnType<typeof paddleRequest<PaddleTransaction>>>;
    try {
      transaction = await paddleRequest<PaddleTransaction>(
        "/transactions",
        {
          method: "POST",
          body: {
            collection_mode: "automatic",
            items: [{ price_id: price, quantity: 1 }],
            custom_data: {
              neon_user_id: user.id,
              workspace_id: workspaceId,
              founding_slot: foundingSlot?.slot ?? null,
              checkout_attempt_id: attemptId,
            },
            checkout: { url: absoluteUrl("/checkout") },
          },
        },
      );
    } catch (error) {
      await database`
        update public.checkout_attempts
        set status = 'failed', updated_at = pg_catalog.now()
        where workspace_id = ${workspaceId}::uuid
          and attempt_id = ${attemptId}::uuid and status = 'creating'
      `.catch(() => undefined);
      throw error;
    }
    const checkoutUrl = transaction.data.checkout?.url;
    if (!checkoutUrl) {
      await database`
        update public.checkout_attempts
        set status = 'failed', updated_at = pg_catalog.now()
        where workspace_id = ${workspaceId}::uuid
          and attempt_id = ${attemptId}::uuid and status = 'creating'
      `;
      throw new Error("Paddle checkout URL was not created.");
    }

    const [savedAttempt] = await database`
      update public.checkout_attempts
      set paddle_transaction_id = ${transaction.data.id},
        checkout_url = ${checkoutUrl}, status = 'pending',
        expires_at = pg_catalog.now() + interval '24 hours',
        updated_at = pg_catalog.now()
      where workspace_id = ${workspaceId}::uuid
        and attempt_id = ${attemptId}::uuid and status = 'creating'
      returning checkout_url
    `;
    if (savedAttempt?.checkout_url !== checkoutUrl) {
      return NextResponse.json({ error: "Checkout is already being confirmed." }, { status: 409 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch {
    return NextResponse.json(
      { error: "Checkout could not be started." },
      { status: 400 },
    );
  }
}
