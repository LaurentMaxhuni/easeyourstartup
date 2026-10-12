import Link from "next/link";
import { PlanCards } from "@/components/pricing/plan-cards";
import { getUnallocatedFoundingSlots, hasUnredeemedFoundingSlot } from "@/lib/server/founding-offer";
import { getCurrentUser } from "@/lib/auth/server";

export async function PricingSection() {
  const [foundingSlotsRemaining, user] = await Promise.all([getUnallocatedFoundingSlots(), getCurrentUser().catch(() => null)]);
  const foundingPriceEligible = user ? await hasUnredeemedFoundingSlot(user.id) : false;
  return (
    <section id="pricing" className="border-t border-line bg-surface px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Free, Pro Lite, and Pro</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Less than the cost of one forgotten launch.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">Start with three projects and one campaign each UTC calendar month. Upgrade for repeat campaigns and exports. Sign in before scanning.</p>
        </div>
        <PlanCards foundingPriceEligible={foundingPriceEligible} />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm leading-6 text-muted">
          <p>{foundingPriceEligible ? "Your workspace keeps its $19 Pro price while the subscription stays uninterrupted." : foundingSlotsRemaining > 0 ? "First ten founders: Pro at $19/month while subscribed." : "Monthly billing. Cancel paid plans anytime."}</p>
          <Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4">Compare plans and usage</Link>
        </div>
      </div>
    </section>
  );
}
