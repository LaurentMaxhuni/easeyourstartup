import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { CheckoutButton } from "@/components/pricing/checkout-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing",
  description: "One straightforward paid plan for repeatable launch campaigns.",
};

const FEATURES = [
  "Three active projects",
  "Eight new campaigns per billing period",
  "Five regenerations per channel output",
  "High resolution PNG and campaign ZIP exports",
  "Recurring rescans and campaign history",
  "Supporter launch rooms without a watermark",
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="border-b border-line py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
            <Badge>Simple by design</Badge>
            <h1 className="mx-auto mt-5 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.07em] sm:text-7xl">
              One plan for founders who keep shipping.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted">
              Sign in to scan for free, then upgrade when the campaign is ready
              to leave the studio.
            </p>
          </div>
        </section>
        <section className="py-16 sm:py-24">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 sm:px-6 lg:grid-cols-[.65fr_1.35fr]">
            <div className="rounded-container border border-line bg-surface p-6">
              <p className="text-lg font-semibold">Free</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                One project scan, editable Brand DNA, one sample campaign, and
                watermarked previews.
              </p>
              <Button asChild variant="secondary" className="mt-8 w-full">
                <Link href="/login?next=%2Fstudio">Sign in for a free scan</Link>
              </Button>
            </div>
            <div className="rounded-container border border-accent bg-surface-raised p-6 sm:p-9">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <p className="text-xl font-semibold">Pro</p>
                  <p className="mt-2 text-sm text-muted">
                    Full campaigns for every shipping cycle
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-6xl font-semibold tracking-[-0.07em]">
                    $29
                  </span>
                  <span className="text-sm text-muted"> / month</span>
                </div>
              </div>
              <div className="my-8 h-px bg-line" />
              <ul className="grid gap-4 sm:grid-cols-2">
                {FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2.5 text-sm leading-6"
                  >
                    <Check
                      className="mt-1 shrink-0 text-accent"
                      size={16}
                      weight="bold"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
                <CheckoutButton label="Start Pro" />
                <p className="max-w-xs text-xs leading-5 text-muted">
                  Founding access is $19/month for the first ten beta founders.
                  Email{" "}
                  <a
                    className="font-semibold text-ink underline underline-offset-4"
                    href="mailto:hello@easeyourstartup.com?subject=Founding%20access"
                  >
                    hello@easeyourstartup.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="border-t border-line bg-surface py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-[-0.045em]">
              How usage works
            </h2>
            <div className="mt-8 grid gap-8 text-sm leading-6 text-muted md:grid-cols-2">
              <p>
                A campaign counts only after generation completes successfully.
                Failed jobs and normal edits never use quota.
              </p>
              <p>
                Cancel through the customer portal at any time. Existing
                exports stay yours.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
