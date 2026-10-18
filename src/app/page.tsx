import { ChannelsSection } from "@/components/landing/channels-section";
import { LaunchPreview } from "@/components/landing/launch-preview";
import { PricingSection } from "@/components/landing/pricing-section";
import { ProofSection } from "@/components/landing/proof-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import { HeroScanForm } from "@/components/hero-scan-form";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import Link from "next/link";
import { ArrowDownRight, Check } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="hero-surface noise overflow-hidden border-b border-line">
          <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 py-12 sm:px-6 sm:py-20 lg:min-h-[760px] lg:grid-cols-[.95fr_1.05fr] lg:gap-12 lg:px-8">
            <Reveal>
              <h1 className="max-w-3xl text-[clamp(2.75rem,4.8vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.055em]">
                <span className="block">Paste your URL.</span>
                <span className="block text-balance text-accent">Leave with a launch kit.</span>
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">
                We map your public source, filter the useful facts, and turn an
                update into channel-ready copy and visuals you can publish.
              </p>
              <HeroScanForm />
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs leading-5 text-muted">
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />3 projects free</span>
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />1 campaign / month</span>
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />No card needed</span>
              </div>
              <Link href="#campaign-preview" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control text-sm font-semibold text-ink hover:text-accent">
                See a campaign preview<ArrowDownRight aria-hidden="true" size={17} className="text-accent" />
              </Link>
              <div className="mt-7 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-5 text-[11px] leading-5 text-muted">
                <div>
                  <span className="mb-2 inline-flex size-6 items-center justify-center rounded-md bg-accent/10 font-semibold text-accent">01</span>
                  <span className="mt-1 block">Source mapped</span>
                </div>
                <div>
                  <span className="mb-2 inline-flex size-6 items-center justify-center rounded-md bg-accent/10 font-semibold text-accent">02</span>
                  <span className="mt-1 block">Screenshots kept real</span>
                </div>
                <div>
                  <span className="mb-2 inline-flex size-6 items-center justify-center rounded-md bg-accent/10 font-semibold text-accent">03</span>
                  <span className="mt-1 block">Launch kit ready to publish</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.08} className="min-w-0">
              <LaunchPreview />
            </Reveal>
          </div>
        </section>
        <WorkflowSection />
        <ProofSection />
        <ChannelsSection />
        <PricingSection />
      </main>
      <SiteFooter />
    </>
  );
}
