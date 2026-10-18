import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { CheckoutButton } from "@/components/pricing/checkout-button";
import { Button } from "@/components/ui/button";
import { PLAN_LIMITS } from "@/lib/entitlements";

export function PlanCards({ foundingPriceEligible = false, checkout = false }: {
  foundingPriceEligible?: boolean;
  checkout?: boolean;
}) {
  const plans = [
    { id: "free", name: "Free", price: "$0", description: "Explore your first launch.",
      features: ["1 campaign per UTC calendar month", "Editable Brand DNA and channel copy", "Watermarked visual previews", "Copy posts to your channels", "Saved projects and source evidence"] },
    { id: "pro_lite", name: "Pro Lite", price: "$13.99", description: "Build a regular launch habit.",
      features: ["8 campaigns per billing period", "Editable channel copy and launch visuals", "High-resolution PNG and launch-kit exports", "5 AI copy regenerations per channel", "Source evidence in every launch kit"] },
    { id: "pro", name: "Pro", price: foundingPriceEligible ? "$19" : "$29", description: "Publish with your brand up front.",
      features: ["8 campaigns per billing period", "Editable channel copy and launch visuals", "High-resolution PNG and launch-kit exports", "5 AI copy regenerations per channel", "Source evidence in every launch kit"] },
  ] as const;

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {plans.map((plan) => (
        <article key={plan.id} aria-labelledby={`plan-${plan.id}`} className={`relative flex min-w-0 flex-col rounded-container border bg-surface-raised p-6 lg:p-8 ${plan.id === "pro" ? "border-accent shadow-[0_0_0_3px_var(--accent-halo),0_12px_40px_var(--accent-halo)]" : "border-line shadow-sm"}`}>
          <div className="mb-5 flex min-h-7 items-center justify-between gap-2">
            <h3 id={`plan-${plan.id}`} className="text-xl font-semibold">{plan.name}</h3>
            {plan.id === "pro" && <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">No watermarks</span>}
          </div>
          <p className="min-h-12 text-sm leading-6 text-muted">{plan.description}</p>
          <p className="mt-5 flex min-h-14 flex-wrap items-baseline gap-2">
            <span className="text-5xl font-semibold tracking-tight md:text-[2rem] lg:text-5xl">{plan.price}</span>
            <span className="text-sm text-muted">{plan.id === "free" ? "forever" : "/ month"}</span>
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
              <CheckoutButton plan={plan.id} variant={plan.id === "pro" ? "primary" : "secondary"}
                label={plan.id === "pro" && foundingPriceEligible ? "Continue at $19/month" : `Start ${plan.name}`} />
            ) : (
              <Button asChild size="lg" variant={plan.id === "pro" ? "primary" : "secondary"} className="w-full">
                <Link href="/pricing">Explore {plan.name}</Link>
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
