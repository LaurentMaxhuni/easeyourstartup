import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Help and support",
  description: "Help with EaseYourStartup scans, saved campaigns, billing, and exports.",
};

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

const helpItems = [
  {
    question: "How many projects and campaigns can I keep?",
    answer: "Free includes one active project and one campaign per UTC calendar month. Pro includes three active projects and eight campaigns per subscription billing period. Archived projects remain saved and can be restored when a project slot is available.",
  },
  {
    question: "Do edits use a campaign slot?",
    answer: "Manual edits do not use campaign allowance. A campaign is counted only after generation completes successfully. A failed campaign generation keeps the existing work and releases its reservation.",
  },
  {
    question: "What does Pro include?",
    answer: "Pro costs $29 per month and includes high-resolution exports and up to five successful AI copy regenerations per channel during each billing period. The $19 founding price is available only to eligible workspaces assigned one of the first ten slots, and continues while the subscription stays uninterrupted.",
  },
  {
    question: "How do I cancel or update payment details?",
    answer: "Open Billing from your dashboard or studio and choose Manage subscription to open Paddle's customer portal. When cancellation is scheduled for the end of a paid period, Pro access continues until that period ends.",
  },
  {
    question: "Can I scan a site behind a login?",
    answer: "No. Website scans are limited to public pages. The scanner page explains which pages it may request and how to reach us with a site-owner request.",
  },
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-4xl px-4 py-16 sm:px-6 lg:py-24">
        <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-accent">Support</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Help with your launch</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">Answers about scanning, saving work, usage, exports, and subscriptions.</p>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {helpItems.map((item) => (
            <section key={item.question} className="py-6">
              <h2 className="text-lg font-semibold">{item.question}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{item.answer}</p>
            </section>
          ))}
        </div>
        <section className="mt-10 rounded-container border border-line bg-surface-raised p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Still stuck?</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Include the project name and what you were trying to do. Please do not email passwords, payment details, or private customer data.</p>
          {supportEmail
            ? <a className="mt-4 inline-flex text-sm font-semibold text-accent underline underline-offset-4" href={`mailto:${supportEmail}`}>Contact support</a>
            : <p className="mt-4 text-sm text-muted">Support contact is not configured in this environment.</p>}
          <p className="mt-4 text-xs text-muted">Manage account details in <Link className="underline underline-offset-4" href="/settings/account">Account settings</Link> or subscription changes in <Link className="underline underline-offset-4" href="/settings/billing">Billing settings</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
