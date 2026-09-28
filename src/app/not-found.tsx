import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="grid min-h-[70dvh] place-items-center px-4 py-16">
      <div className="max-w-lg rounded-container border border-line bg-surface-raised p-7 text-center sm:p-10">
        <p className="font-sans text-[10px] uppercase  text-accent">404 · Not found</p>
        <h1 className="mt-3 text-3xl font-semibold ">That page is unavailable.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">The link may have expired or the item may have been removed. Your other projects remain available from the dashboard.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild><Link href="/dashboard">Open dashboard</Link></Button>
          <Button asChild variant="secondary"><Link href="/">Back to home</Link></Button>
        </div>
      </div>
    </main>
  );
}
