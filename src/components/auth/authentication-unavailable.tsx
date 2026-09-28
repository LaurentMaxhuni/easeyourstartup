import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AuthenticationUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-5 py-12">
      <section className="w-full max-w-lg rounded-container border border-line bg-surface-raised p-7 sm:p-9">
        <h1 className="text-2xl font-semibold">Session check unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We couldn&apos;t verify your session. This check didn&apos;t sign you out.
          Try again in a moment.
        </p>
        <Button asChild className="mt-6">
          <Link href={retryHref}>Try again</Link>
        </Button>
      </section>
    </main>
  );
}
