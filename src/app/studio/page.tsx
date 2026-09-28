import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { StudioShell } from "@/components/studio/studio-shell";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { userNeedsOnboarding } from "@/lib/server/onboarding";

export const metadata: Metadata = {
  title: "Launch studio",
  description: "Scan, curate, generate, and export a launch campaign.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; new?: string; newCampaign?: string; projectId?: string; campaignId?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.url) query.set("url", params.url);
  if (params.new === "1") query.set("new", "1");
  if (params.newCampaign === "1") query.set("newCampaign", "1");
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.campaignId) query.set("campaignId", params.campaignId);
  const nextPath = `/studio${query.toString() ? `?${query}` : ""}`;
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    if (auth.status === 503) {
      return <AuthenticationUnavailable retryHref={nextPath} />;
    }
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (await userNeedsOnboarding(auth.user.id)) {
    redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          <LoadingIndicator label="Opening launch studio" />
        </div>
      }
    >
      <StudioShell
        initialAuthenticated
        profile={{
          name: auth.user.name ?? null,
          email: auth.user.email ?? null,
          image: auth.user.image ?? null,
        }}
      />
    </Suspense>
  );
}
