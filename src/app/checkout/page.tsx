import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { CheckoutClient } from "@/app/checkout/checkout-client";

export const metadata: Metadata = {
  title: "Secure checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/pricing" className="text-sm text-muted underline underline-offset-4">Back to pricing</Link>
      </div>
      <section className="my-auto py-16">
        <p className="font-sans text-[10px] uppercase  text-accent">Secure payment</p>
        <h1 className="mt-3 text-3xl font-semibold ">Start EaseYourStartup Pro</h1>
        <p className="mt-3 mb-7 text-sm leading-6 text-muted">Complete your subscription in Paddle’s secure checkout.</p>
        <CheckoutClient />
      </section>
    </main>
  );
}
