"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { motion, useReducedMotion } from "motion/react";
import { CheckoutButton } from "@/components/pricing/checkout-button";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS } from "@/lib/entitlements";
import { PAID_PRICES, type BillingInterval } from "@/lib/pricing";

export function PlanCards({ foundingPriceEligible = false, checkout = false, initialBillingInterval = "monthly" }: {
  foundingPriceEligible?: boolean;
  checkout?: boolean;
  initialBillingInterval?: BillingInterval;
}) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(initialBillingInterval);
  const selectorId = useId();
  const reducedMotion = useReducedMotion();
  const annual = billingInterval === "annual";
  const plans = [
    { id: "free", name: "Free", price: "$0", description: "Explore your first launch.",
      features: ["1 campaign per UTC calendar month", "Editable Brand DNA and channel copy", "Watermarked visual previews", "Copy posts to your channels", "Saved projects and source evidence"] },
    { id: "pro_lite", name: "Pro Lite", price: "$13.99", description: "Build a regular launch habit.",
      features: [annual ? "8 campaigns per UTC calendar month" : "8 campaigns per monthly billing period", "Editable channel copy and launch visuals", "High-resolution PNG and launch-kit exports", "5 AI copy regenerations per channel", "Source evidence in every launch kit"] },
    { id: "pro", name: "Pro", price: foundingPriceEligible ? "$19" : "$29", description: "Publish with your brand up front.",
      features: [annual ? "8 campaigns per UTC calendar month" : "8 campaigns per monthly billing period", "Editable channel copy and launch visuals", "High-resolution PNG and launch-kit exports", "5 AI copy regenerations per channel", "Source evidence in every launch kit"] },
  ] as const;

  return (
    <div>
    <fieldset className="mx-auto mb-8 w-fit">
      <legend className="sr-only">Billing interval</legend>
      <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
        {(["monthly", "annual"] as const).map((interval) => (
          <label key={interval} className="relative cursor-pointer rounded-full transition-colors hover:bg-ink/5 motion-safe:active:scale-[0.98]">
            <input type="radio" name={`billing-${selectorId}`} value={interval}
              checked={billingInterval === interval} onChange={() => setBillingInterval(interval)}
              className="peer sr-only" />
            {billingInterval === interval && <motion.span layoutId={`billing-active-${selectorId}`} aria-hidden="true"
              className="absolute inset-0 rounded-full bg-accent"
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }} />}
            <span className={`relative flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-accent sm:px-6 ${billingInterval === interval ? "text-accent-ink" : "text-muted"}`}>
              {interval === "monthly" ? "Monthly" : "Annually"}
              {interval === "annual" && <span className={`rounded-full px-2 py-0.5 text-[10px] ${annual ? "bg-white/20 text-accent-ink" : "bg-accent/10 text-accent"}`}>Save 20%</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((plan) => {
        const prices = plan.id === "free" ? null : PAID_PRICES[plan.id === "pro" && foundingPriceEligible ? "founding" : plan.id];
        const price = prices && annual ? `$${(prices.annual / 12).toFixed(2)}` : plan.price;
        return (
        <article key={plan.id} aria-labelledby={`plan-${plan.id}`} className={`relative flex min-w-0 flex-col rounded-container border bg-surface-raised p-6 lg:p-8 ${plan.id === "pro" ? "border-accent shadow-[0_0_0_3px_var(--accent-halo),0_12px_40px_var(--accent-halo)]" : "border-line shadow-sm"}`}>
          <div className="mb-5 flex min-h-7 items-center justify-between gap-2">
            <h3 id={`plan-${plan.id}`} className="text-xl font-semibold">{plan.name}</h3>
            {plan.id === "pro" && <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">No watermarks</span>}
          </div>
          <p className="min-h-12 text-sm leading-6 text-muted">{plan.description}</p>
          <p className="mt-5 flex min-h-14 flex-wrap items-baseline gap-2">
            <motion.span key={plan.id === "free" ? "free" : billingInterval} initial={reducedMotion ? false : { opacity: 0.2, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="text-5xl font-semibold tracking-tight md:text-[2rem] lg:text-5xl">{price}</motion.span>
            <span className="text-sm text-muted">{plan.id === "free" ? "forever" : "/ month"}</span>
          </p>
          <p className="mt-2 min-h-10 text-xs leading-5 text-muted">
            {prices ? annual ? `$${prices.annual.toFixed(2)} billed annually` : `$${prices.monthly.toFixed(2)} billed monthly` : "Free for as long as you need."}
          </p>
          <p className="mt-5 border-b border-line pb-5 text-sm font-semibold">
            <span className="text-2xl text-accent">{PLAN_LIMITS[plan.id].activeProjects}</span> active projects
          </p>
          <p className="mt-5 text-xs font-semibold text-muted">{plan.id === "pro" ? "Your visuals, without watermarks" : plan.id === "pro_lite" ? "Watermarks on previews and exports" : "Watermarks on visual previews"}</p>
          <ul className="my-6 space-y-3.5 text-sm leading-6">
            {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2.5">
              <Check aria-hidden="true" size={17} weight="bold" className="mt-1 shrink-0 text-accent" />
              <span>{feature}</span>
            </li>)}
          </ul>
          <div className="mt-auto pt-2">
            {plan.id === "free" ? (
              <Button asChild variant="secondary" size="lg" className="w-full">
                <Link href="/login?next=%2Fstudio%3Fnew%3D1">Start free</Link>
              </Button>
            ) : checkout ? (
              <CheckoutButton key={billingInterval} plan={plan.id} billingInterval={billingInterval} variant={plan.id === "pro" ? "primary" : "secondary"}
                label={plan.id === "pro" && foundingPriceEligible ? annual ? "Continue at $182.40/year" : "Continue at $19/month" : `Start ${plan.name}`} />
            ) : (
              <Button asChild size="lg" variant={plan.id === "pro" ? "primary" : "secondary"} className="w-full">
                <Link href={annual ? "/pricing?billing=annual" : "/pricing"}>Explore {plan.name}</Link>
              </Button>
            )}
          </div>
        </article>
      );})}
    </div>
    </div>
  );
}
