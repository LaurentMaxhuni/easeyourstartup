import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioShell } from "@/components/studio/studio-shell";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { requirePageAuthentication } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Launch studio",
  description: "Scan, approve, generate, and export a launch campaign.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; demo?: string; new?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.url) query.set("url", params.url);
  if (params.demo === "1") query.set("demo", "1");
  if (params.new === "1") query.set("new", "1");
  const nextPath = `/studio${query.toString() ? `?${query}` : ""}`;
  await requirePageAuthentication(nextPath);

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          <LoadingIndicator label="Opening launch studio" />
        </div>
      }
    >
      <StudioShell />
    </Suspense>
  );
}
