import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";

const PRO_FEATURES = [
  "Three active projects",
  "Eight campaigns per billing period",
  "Editable channel copy and launch visuals",
  "High resolution PNG and launch-kit exports",
  "Source evidence in every exported kit",
  "Founding beta support",
];

export function PricingSection() {
  return (
    <section id="pricing" className="border-t border-line bg-ink py-24 text-canvas sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <Reveal>
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-[#93adff]">
              One paid plan
            </p>
            <h2 className="mt-5 max-w-xl text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
              Less than the cost of one forgotten launch.
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-[#b7bcb4]">
              Sign in for a free scan and sample campaign. Upgrade when you are
              ready to export and keep shipping.
            </p>
          </Reveal>
          <Reveal
            delay={0.08}
            className="rounded-container border border-white/20 bg-[#202420] p-6 sm:p-9"
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-lg font-semibold">Pro</p>
                <p className="mt-1 text-sm text-[#b7bcb4]">
                  For founders building a launch habit
                </p>
              </div>
              <div className="text-right">
                <span className="text-5xl font-semibold tracking-[-0.06em]">
                  $29
                </span>
                <span className="text-sm text-[#b7bcb4]"> / month</span>
              </div>
            </div>
            <div className="my-8 h-px bg-[#f4f3ef]/20" />
            <ul className="grid gap-4 sm:grid-cols-2">
              {PRO_FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-2.5 text-sm leading-6 text-[#e9e9e4]"
                >
                  <Check
                    className="mt-1 shrink-0 text-[#93adff]"
                    size={16}
                    weight="bold"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/pricing">
                  See founding access
                  <ArrowRight size={18} />
                </Link>
              </Button>
              <span className="text-xs text-[#b7bcb4]">
                Beta founders start at $19/month.
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
