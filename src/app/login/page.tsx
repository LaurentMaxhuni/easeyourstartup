import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

function safeNext(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[.9fr_1.1fr]">
      <section className="relative isolate flex overflow-hidden border-b border-white/15 bg-[#0b286f] p-6 text-[#f4f3ef] lg:border-b-0 lg:border-r lg:p-10">
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 bg-[url('/images/auth-geometry.png')] bg-cover bg-center"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 bg-[#071b4c]/70"
        />
        <div className="relative z-10 flex flex-1 flex-col justify-between">
          <Logo />
          <div className="py-16">
            <p className="font-sans text-xs uppercase tracking-[0.16em] text-[#b9d0ff]">
              Your launch history lives here
            </p>
            <h1 className="mt-5 max-w-xl text-balance text-5xl font-semibold tracking-[-0.065em] sm:text-6xl">
              Pick up where your last ship left off.
            </h1>
          </div>
          <p className="text-xs text-[#d2ddf5]">
            Email and Google authentication powered by Neon Auth.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-container border border-line bg-surface-raised p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">
            Sign in or create an account
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Use your email and password, or continue with Google.
          </p>
          <div className="mt-7">
            <SignInForm nextPath={safeNext(params.next)} />
          </div>
        </div>
      </section>
    </main>
  );
}
