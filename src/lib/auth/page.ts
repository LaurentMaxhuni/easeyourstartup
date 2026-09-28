import "server-only";

import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { userNeedsOnboarding } from "@/lib/server/onboarding";

export async function requirePageAuthentication(nextPath: string) {
  const result = await getAuthenticatedUser();
  if (!result.user) {
    if (result.status === 503) return result;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (await userNeedsOnboarding(result.user.id)) {
    redirect(`/onboarding?next=${encodeURIComponent(nextPath)}`);
  }
  return result.user;
}
