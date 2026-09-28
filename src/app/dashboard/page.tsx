import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { requirePageAuthentication } from "@/lib/auth/page";
import { getStudioStorageKey } from "@/lib/server/studio-state";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Pick up a launch workspace and keep every ship moving.",
};

export default async function DashboardPage() {
  const user = await requirePageAuthentication("/dashboard");
  if ("status" in user) {
    return <AuthenticationUnavailable retryHref="/dashboard" />;
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted">
          <LoadingIndicator label="Opening dashboard" />
        </div>
      }
    >
      <DashboardShell
        storageKey={getStudioStorageKey(user.id)}
        profile={{
          name: user.name ?? null,
          email: user.email ?? null,
          image: user.image ?? null,
        }}
      />
    </Suspense>
  );
}
