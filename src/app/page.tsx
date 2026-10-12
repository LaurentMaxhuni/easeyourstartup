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
          <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:min-h-[740px] lg:grid-cols-[.9fr_1.1fr] lg:gap-14 lg:px-8">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">
                Launch campaigns for every product update
              </p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.5rem,4.8vw,4.2rem)] font-semibold leading-[1.04] tracking-tight">
                <span className="block">Paste your URL.</span>
                <span className="block text-balance">Leave with a launch kit.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-7 text-muted">
                We map your public source, filter the useful facts, and turn an
                update into channel-ready copy and visuals you can publish.
              </p>
              <HeroScanForm />
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs leading-5 text-muted">
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />3 projects free</span>
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />1 campaign / month</span>
                <span className="inline-flex items-center gap-1.5"><Check aria-hidden="true" size={15} className="text-accent" />No card needed</span>
              </div>
              <Link href="#campaign-preview" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4">
                See a campaign preview<ArrowDownRight aria-hidden="true" size={17} />
              </Link>
              <div className="mt-9 grid max-w-xl grid-cols-3 gap-3 border-t border-line pt-4 text-[11px] leading-4 text-muted">
                <div>
                  <span className="block font-sans text-accent">01</span>
                  <span className="mt-1 block">Source mapped</span>
                </div>
                <div>
                  <span className="block font-sans text-accent">02</span>
                  <span className="mt-1 block">Screenshots kept real</span>
                </div>
                <div>
                  <span className="block font-sans text-accent">03</span>
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
