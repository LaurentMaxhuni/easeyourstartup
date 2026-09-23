import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Website scanner information",
  description: "How the user-initiated EaseYourStartup website scanner accesses public product pages.",
};

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export default function ScannerInformationPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-accent">Crawler information</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">EaseYourStartupBot</h1>
        <p className="mt-5 text-base leading-7 text-muted">EaseYourStartup does not run a general-purpose search crawler. The bot makes requests only after a customer submits a public website URL for a product scan.</p>
        <div className="mt-8 space-y-5 text-sm leading-6 text-muted">
          <p>The scanner reads the submitted page and may request up to five additional links on the same site to summarize public product information and visual styles. It identifies itself as <code className="rounded bg-surface-raised px-1.5 py-0.5 text-ink">EaseYourStartupBot/0.1</code>.</p>
          <p>Requests are limited by page count, response size, redirects, and time. The scanner does not sign in, submit forms, or attempt to access private areas. Screenshot capture is a separate, user-triggered step for the submitted project.</p>
          <p>If you operate a site and want scanning to stop for your domain, {supportEmail ? <>contact <a className="font-semibold text-accent underline underline-offset-4" href={`mailto:${supportEmail}`}>{supportEmail}</a> with the domain and request</> : "use the EaseYourStartup account support contact once it is configured"}. This page describes behavior; it does not grant permission to access content.</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
