import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { userNeedsOnboarding } from "@/lib/server/onboarding";

export const metadata: Metadata = {
  title: "Set up your launch desk",
  description: "A few details to make your first launch easier.",
};

function safeNext(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/dashboard";

  try {
    const url = new URL(value, "https://easeyourstartup.invalid");
    if (
      url.origin !== "https://easeyourstartup.invalid" ||
      url.pathname === "/onboarding" ||
      url.pathname === "/login"
    ) {
      return "/dashboard";
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  const auth = await getAuthenticatedUser();

  if (!auth.user) {
    if (auth.status === 503) {
      return <AuthenticationUnavailable retryHref={nextPath} />;
    }
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!(await userNeedsOnboarding(auth.user.id))) {
    redirect(nextPath);
  }

  return <OnboardingWizard nextPath={nextPath} />;
}
