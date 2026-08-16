import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ChannelsSection } from "@/components/landing/channels-section";
import { LaunchPreview } from "@/components/landing/launch-preview";
import { PricingSection } from "@/components/landing/pricing-section";
import { ProofSection } from "@/components/landing/proof-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import { HeroScanForm } from "@/components/hero-scan-form";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <section className="hero-surface noise overflow-hidden border-b border-line">
          <div className="mx-auto grid min-h-[calc(100svh-64px)] max-w-[1440px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-12">
            <Reveal>
              <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
                Launch campaigns for every product update
              </p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.5rem,4.8vw,4.2rem)] font-semibold leading-[.95] tracking-[-0.07em]">
                <span className="block">Paste your URL.</span>
                <span className="block">Launch everywhere.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-7 text-muted">
                Scan your site, approve your facts, and turn every ship into a
                complete campaign.
              </p>
              <HeroScanForm />
              <Link
                href="/login?next=%2Fshare%2Fdemo-launch"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ink"
              >
                See a live supporter room
                <ArrowRight size={17} />
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
                  <span className="mt-1 block">Copy ready to export</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
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
