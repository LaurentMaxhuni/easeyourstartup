import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { DesignStudio } from "@/components/design-studio/design-studio";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { userNeedsOnboarding } from "@/lib/server/onboarding";

export const metadata: Metadata = { title: "AI Design Studio", description: "Create, refine, and export editable brand designs." };

export default async function DesignStudioPage() {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    if (auth.status === 503) return <AuthenticationUnavailable retryHref="/studio/design" />;
    redirect("/login?next=%2Fstudio%2Fdesign");
  }
  if (await userNeedsOnboarding(auth.user.id)) redirect("/onboarding?next=%2Fstudio%2Fdesign");
  const scope = createHash("sha256").update(auth.user.id).digest("hex").slice(0, 24);
  return <DesignStudio storageKey={`eys-design-studio-${scope}`} />;
}
