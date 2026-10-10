import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { getUnallocatedFoundingSlots } from "@/lib/server/founding-offer";
import { hasUnredeemedFoundingSlot } from "@/lib/server/founding-offer";
import { getCurrentUser } from "@/lib/auth/server";

const PRO_FEATURES = [
  "Ten active projects",
  "Eight campaigns per billing period",
  "Editable channel copy and launch visuals",
  "High resolution PNG and launch-kit exports without watermarks",
  "Source evidence in every exported kit",
  "Five successful AI copy regenerations per channel",
];

export async function PricingSection() {
  const [foundingSlotsRemaining, user] = await Promise.all([
    getUnallocatedFoundingSlots(),
    getCurrentUser().catch(() => null),
  ]);
  const foundingPriceEligible = user ? await hasUnredeemedFoundingSlot(user.id) : false;
  return (
    <section id="pricing" className="border-t border-line bg-ink py-24 text-canvas sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <Reveal>
            <p className="font-sans text-xs uppercase  text-[#93adff]">
              Free, Pro Lite, and Pro
            </p>
            <h2 className="mt-5 max-w-xl text-balance text-4xl font-semibold  sm:text-6xl">
              Less than the cost of one forgotten launch.
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-[#b7bcb4]">
              Sign in before scanning. Start with three projects and one campaign
              each UTC calendar month, then upgrade for repeat campaigns and exports.
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-[#b7bcb4]">
              Pro Lite: $13.99/month for five active projects, eight campaigns per billing period, and watermarked exports.
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
                <span className="text-5xl font-semibold ">
                  {foundingPriceEligible ? "$19" : "$29"}
                </span>
                <span className="text-sm text-[#b7bcb4]"> / month{foundingPriceEligible ? " · founding price" : ""}</span>
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
                  {foundingPriceEligible ? "Reserved $19/month" : foundingSlotsRemaining > 0 ? "See founding access" : "See Pro plan"}
                  <ArrowRight size={18} />
                </Link>
              </Button>
              {foundingPriceEligible
                ? <span className="text-xs text-[#b7bcb4]">Your workspace keeps this price while the subscription stays uninterrupted.</span>
                : foundingSlotsRemaining > 0 && <span className="text-xs text-[#b7bcb4]">First ten founders: $19/month while subscribed.</span>}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
