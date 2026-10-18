import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { PlanCards } from "@/components/pricing/plan-cards";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { getUnallocatedFoundingSlots, hasUnredeemedFoundingSlot } from "@/lib/server/founding-offer";
import { getCurrentUser } from "@/lib/auth/server";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
export const metadata: Metadata = { title: "Pricing", description: "Free, Pro Lite, and Pro plans for repeatable launch campaigns." };
export const dynamic = "force-dynamic";

const QUESTIONS = [
  { question: "What can I do on Free?", answer: "Keep three active projects, edit your Brand DNA and channel copy, and create one campaign each UTC calendar month. Visual previews carry a watermark. Copying posts is free; PNG and launch-kit downloads are included with the paid plans." },
  { question: "What is the difference between Pro Lite and Pro?", answer: "Pro Lite includes five active projects and watermarked exports for $13.99/month or $134.30/year. Pro includes ten active projects and removes watermarks for $29/month or $278.40/year. Both include eight campaigns a month, high-resolution exports, source evidence, and five successful AI copy regenerations per channel." },
  { question: "What counts toward my campaign allowance?", answer: "A campaign counts only after generation completes successfully. While one is running, its slot is reserved so two tabs cannot overrun your plan. Failed jobs and normal edits never use quota. Free and annual plans reset each UTC calendar month; monthly paid plans reset each monthly billing period. Unused campaigns do not roll over." },
  { question: "How does annual billing work?", answer: "Annual plans charge the full yearly total upfront, saving 20% against twelve monthly payments (rounded to cents). Campaign allowances still reset monthly. Eligible founding workspaces can choose Pro at $19/month or $182.40/year while the subscription stays uninterrupted. Any applicable tax appears at checkout." },
  { question: "Can I cancel and keep my work?", answer: "Cancel through the customer portal in Billing settings. Paid access continues through the paid period, and your saved work remains available after cancellation. Archived projects stay saved and can be restored when your plan has an available project slot." },
];

export default async function PricingPage({ searchParams }: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const [foundingSlotsRemaining, user] = await Promise.all([getUnallocatedFoundingSlots(), getCurrentUser().catch(() => null)]);
  const foundingPriceEligible = user ? await hasUnredeemedFoundingSlot(user.id) : false;
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="px-4 pb-10 pt-14 text-center sm:px-6 sm:pb-12 sm:pt-20">
          <Badge>Free, Pro Lite, and Pro</Badge>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Plans for founders who keep shipping.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted">Start with three projects and one campaign a month, free. Choose a paid plan when you need more launches and downloadable visuals.</p>
          <p className="mt-3 text-sm font-medium">Pay monthly or save 20% annually. Cancel paid plans anytime.</p>
        </section>
        <section aria-labelledby="compare-plans" className="px-4 pb-14 sm:px-6 sm:pb-20">
          <div className="mx-auto max-w-6xl">
            <h2 id="compare-plans" className="sr-only">Compare plans</h2>
            <PlanCards foundingPriceEligible={foundingPriceEligible} initialBillingInterval={billing === "annual" ? "annual" : "monthly"} checkout />
            <p className="mt-6 text-center text-xs leading-5 text-muted">All plans include saved projects and editable drafts. AI copy regeneration limits count successful regenerations only. Sign in before scanning.</p>
            {foundingPriceEligible ? <p className="mt-4 rounded-control border border-accent/25 bg-accent/5 p-4 text-center text-sm leading-6">Your workspace has one of ten founding slots. Pro is $19/month or $182.40/year while your subscription stays uninterrupted.</p> : foundingSlotsRemaining > 0 && supportEmail && <p className="mt-4 text-center text-sm leading-6 text-muted">Founding Pro access: $19/month or $182.40/year for the first ten founders while subscribed. <a className="font-semibold text-accent underline underline-offset-4" href={`mailto:${supportEmail}?subject=Founding%20access`}>Request a founding place</a>.</p>}
          </div>
        </section>
        <section aria-labelledby="pricing-questions" className="border-t border-line bg-surface px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Before your next launch</p>
              <h2 id="pricing-questions" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A few useful answers.</h2>
              <p className="mt-4 text-sm leading-6 text-muted">Clear allowances. Saved work. You decide when to publish.</p>
              <Link href="/help" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-4">Visit help and support</Link>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {QUESTIONS.map(({ question, answer }) => <details key={question} className="group py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 rounded-control py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {question}<Plus aria-hidden="true" size={18} className="shrink-0 text-accent transition-transform group-open:rotate-45" />
                </summary>
                <p className="max-w-2xl pb-5 pr-6 text-sm leading-7 text-muted">{answer}</p>
              </details>)}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
