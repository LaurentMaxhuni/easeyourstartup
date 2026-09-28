import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PasswordResetRequest } from "@/components/auth/password-reset-request";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-12">
      <section className="w-full max-w-md rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          <ArrowLeft size={16} aria-hidden="true" />
          Sign in
        </Link>
        <h1 className="mt-6 text-3xl font-semibold ">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-muted">We will email a secure link if an account exists for that address.</p>
        <PasswordResetRequest />
      </section>
    </main>
  );
}
