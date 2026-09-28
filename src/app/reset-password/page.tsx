import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-12">
      <section className="w-full max-w-md rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          <ArrowLeft size={16} aria-hidden="true" />
          Sign in
        </Link>
        <h1 className="mt-6 text-3xl font-semibold ">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Use at least 8 characters.</p>
        {token ? <PasswordResetForm token={token} /> : <p role="alert" className="mt-5 text-sm text-danger">This reset link is missing or invalid. Request a new one.</p>}
      </section>
    </main>
  );
}
