import "server-only";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  createDatabase,
  type DatabaseClient,
} from "@/lib/server/database";
import { PLAN_LIMITS, type Plan } from "@/lib/entitlements";
import { getUsageWindow } from "@/lib/usage-window";

export function isLocalTestMode() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.EASEYOURSTARTUP_TEST_MODE?.trim().toLowerCase() !== "true"
  ) {
    return false;
  }

  try {
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export async function ensureWorkspaceForUser(
  database: DatabaseClient,
  userId: string,
  workspaceName = "My workspace",
) {
  const [workspace] = await database`
    select public.ensure_workspace_for_user(
      ${userId}::uuid,
      ${workspaceName}::text
    ) as workspace_id
  `;
  const workspaceId = workspace?.workspace_id;
  if (typeof workspaceId !== "string") {
    throw new Error("Workspace could not be created.");
  }
  return workspaceId;
}

export async function requireWorkspaceContext() {
  const user = await requireCurrentUser();

  const database = createDatabase();
  if (!database) throw new Error("Database is not configured.");
  const workspaceId = await ensureWorkspaceForUser(
    database,
    user.id,
    user.name?.trim() || `${user.email?.split("@")[0] ?? "My"} workspace`,
  );

  const [subscription] = await database`
    select s.status, s.billing_price_id, s.current_period_start,
      s.current_period_end,
      exists (
        select 1 from public.founding_slots f
        where f.workspace_id = s.workspace_id
      ) as founding_offer_eligible
    from public.subscriptions s
    where s.workspace_id = ${workspaceId}
      and s.billing_provider = 'paddle'
    limit 1
  `;
  const [testGrant] = isLocalTestMode()
    ? await database`
        select expires_at
        from public.test_pro_grants
        where user_id = ${user.id}::uuid
          and workspace_id = ${workspaceId}::uuid
          and expires_at > pg_catalog.now()
        limit 1
      `
    : [];
  const regularPriceId = process.env.PADDLE_PRO_PRICE_ID?.trim();
  const foundingPriceId = process.env.PADDLE_FOUNDING_PRICE_ID?.trim();
  const litePriceId = process.env.PADDLE_PRO_LITE_PRICE_ID?.trim();
  const annualProPriceId = process.env.PADDLE_PRO_ANNUAL_PRICE_ID?.trim();
  const annualFoundingPriceId = process.env.PADDLE_FOUNDING_ANNUAL_PRICE_ID?.trim();
  const annualLitePriceId = process.env.PADDLE_PRO_LITE_ANNUAL_PRICE_ID?.trim();
  const matchesPrice = (...prices: Array<string | undefined>) =>
    prices.some((price) => Boolean(price && subscription?.billing_price_id === price));
  const isEligibleProSubscription = Boolean(
    subscription &&
      ["active", "trialing"].includes(subscription.status) &&
      (matchesPrice(regularPriceId, annualProPriceId) ||
        (matchesPrice(foundingPriceId, annualFoundingPriceId) &&
          subscription.founding_offer_eligible === true)),
  );
  const testProExpiresAt = testGrant?.expires_at ?? null;
  const isEligibleLiteSubscription = Boolean(
    subscription &&
      ["active", "trialing"].includes(subscription.status) &&
      matchesPrice(litePriceId, annualLitePriceId),
  );
  const plan: Plan = isEligibleProSubscription || testProExpiresAt
    ? "pro" : isEligibleLiteSubscription ? "pro_lite" : "free";
  const billingInterval = matchesPrice(annualProPriceId, annualFoundingPriceId, annualLitePriceId)
    ? "annual" : "monthly";
  const { start: usagePeriodStart, end: usagePeriodEnd } = getUsageWindow(
    plan === "free" ? "free" : billingInterval,
    subscription?.current_period_start,
    subscription?.current_period_end,
  );
  return {
    database,
    user,
    workspaceId,
    plan,
    limits: PLAN_LIMITS[plan],
    usagePeriodStart,
    usagePeriodEnd,
    testProExpiresAt,
  };
}
