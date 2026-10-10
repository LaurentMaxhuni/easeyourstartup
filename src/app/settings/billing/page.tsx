import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { BillingPortalButton } from "@/components/billing/billing-portal-button";
import { Button } from "@/components/ui/button";
import { requirePageAuthentication } from "@/lib/auth/page";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const metadata: Metadata = { title: "Billing" };

function formatDate(value: unknown) {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export default async function BillingSettingsPage() {
  const user = await requirePageAuthentication("/settings/billing");
  if ("status" in user) {
    return <AuthenticationUnavailable retryHref="/settings/billing" />;
  }
  const context = await requireWorkspaceContext();
  const [[subscription], [usage], [founding]] = await Promise.all([
    context.database`
      select billing_provider, status, billing_price_id, current_period_start, current_period_end,
        cancel_at_period_end, billing_customer_id
      from public.subscriptions
      where workspace_id = ${context.workspaceId}
      limit 1
    `,
    context.database`
      select completed_campaigns, reserved_campaigns
      from public.usage_periods
      where workspace_id = ${context.workspaceId}
        and period_start = ${context.usagePeriodStart}::date
      limit 1
    `,
    context.database`
      select slot, redeemed_at from public.founding_slots
      where workspace_id = ${context.workspaceId} limit 1
    `,
  ]);
  const foundingPriceId = process.env.PADDLE_FOUNDING_PRICE_ID?.trim();
  const isFounding = Boolean(foundingPriceId && subscription?.billing_price_id === foundingPriceId);
  const hasUnrecognizedActiveSubscription =
    context.plan === "free" &&
    ["active", "trialing"].includes(subscription?.status ?? "");
  const hasNoActiveSubscription =
    context.plan === "free" && !hasUnrecognizedActiveSubscription;
  const hasSubscription = Boolean(subscription?.billing_customer_id);
  const renewalDate = formatDate(subscription?.current_period_end);
  const used = Number(usage?.completed_campaigns ?? 0);
  const reserved = Number(usage?.reserved_campaigns ?? 0);

  return (
    <main id="main-content" className="min-h-[100dvh] bg-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          <ArrowLeft size={16} aria-hidden="true" />
          Dashboard
        </Link>
        <p className="mt-8 font-sans text-[10px] uppercase  text-accent">Workspace settings</p>
        <h1 className="mt-2 text-4xl font-semibold ">Plan and billing</h1>
        <section className="mt-7 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted">Current plan</p>
              <h2 className="mt-1 text-2xl font-semibold">{context.plan === "pro" ? "Pro" : context.plan === "pro_lite" ? "Pro Lite" : "Free"}</h2>
              <p className="mt-2 text-sm text-muted">
                {context.plan !== "free"
                  ? context.testProExpiresAt
                    ? `Temporary test access · expires ${formatDate(context.testProExpiresAt) ?? "soon"}`
                    : `${context.plan === "pro_lite" ? "$13.99" : isFounding ? "$19" : "$29"} per month · ${isFounding ? "Founding price" : "monthly subscription"}`
                  : founding && !founding.redeemed_at
                    ? "Founding price reserved for your workspace: $19/month"
                    : "Three active projects · one campaign each calendar month"}
              </p>
            </div>
            {context.plan === "free" && (
              <Button asChild><Link href="/pricing">View Pro</Link></Button>
            )}
          </div>
          {hasUnrecognizedActiveSubscription && (
            <p role="status" className="mt-5 rounded-lg border border-amber-300/40 bg-amber-50/5 px-4 py-3 text-sm leading-6 text-muted">
              {subscription?.billing_provider === "stripe"
                ? "An active legacy Stripe subscription is recorded for this workspace. This app currently grants Pro only for recognized Paddle subscriptions."
                : "Paddle reports an active subscription for this workspace, but this environment could not match its price to Pro. Check the Paddle price IDs in the app configuration before changing plans."}
            </p>
          )}
          {hasNoActiveSubscription && (
            <p role="status" className="mt-5 rounded-lg border border-line bg-canvas px-4 py-3 text-sm leading-6 text-muted">
              No active subscription is attached to this workspace. Pro access is workspace-specific; if you already have Pro, check the workspace that owns the subscription before purchasing again.
            </p>
          )}
          {context.plan !== "free" && (
            <div className="mt-6 border-t border-line pt-5 text-sm">
              {context.testProExpiresAt ? (
                <p className="text-muted">
                  Pro is enabled for local testing until {formatDate(context.testProExpiresAt) ?? "the expiry date"}. No payment or Paddle subscription was created.
                </p>
              ) : (
                <>
                  <p className="font-semibold">Subscription status: <span className="capitalize">{subscription?.status ?? "active"}</span></p>
                  <p className="mt-2 text-muted">
                    {subscription?.cancel_at_period_end
                      ? `Your subscription is scheduled to end${renewalDate ? ` on ${renewalDate}` : ""}. Pro access remains available through the paid period.`
                      : renewalDate ? `Next renewal: ${renewalDate}` : "Renewal date will appear after Paddle confirms the subscription."}
                  </p>
                </>
              )}
              {hasSubscription && <div className="mt-5"><BillingPortalButton /></div>}
            </div>
          )}
        </section>

        <section className="mt-4 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Usage this period</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {used} completed campaign{used === 1 ? "" : "s"}{reserved ? ` · ${reserved} in progress` : ""} of {context.limits.campaignsPerPeriod}. {context.plan !== "free" ? "The allowance renews with your subscription." : "The Free allowance resets at the start of each UTC calendar month."}
          </p>
          <p className="mt-1 text-xs text-muted">Period ends {formatDate(context.usagePeriodEnd) ?? context.usagePeriodEnd}. Active project limit: {context.limits.activeProjects}.</p>
          <p className="mt-3 text-xs leading-5 text-muted">Free includes 3 active projects and watermarked previews. Pro Lite ($13.99/month) includes 5 active projects and watermarked exports. Pro includes 10 active projects and exports without watermarks. Both paid plans include 8 campaigns per billing period and 5 successful regenerations per channel. Manual edits do not use campaign allowance.</p>
        </section>

        {founding && (
          <p className="mt-4 text-xs leading-5 text-muted">
            Founding slot {founding.slot} is attached to this workspace. The $19 price continues while the subscription remains uninterrupted; cancellation ends the founding offer.
          </p>
        )}
      </div>
    </main>
  );
}
