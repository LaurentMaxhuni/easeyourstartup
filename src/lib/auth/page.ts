import "server-only";

import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/server";

export async function requirePageAuthentication(nextPath: string) {
  const result = await getAuthenticatedUser();
  if (!result.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return result.user;
}
