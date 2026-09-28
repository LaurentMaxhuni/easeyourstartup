import "server-only";

import { createDatabase } from "@/lib/server/database";

function postgresErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error
    ? error.code
    : null;
}

export async function userNeedsOnboarding(userId: string) {
  const database = createDatabase();
  if (!database) return false;

  try {
    const [row] = await database`
      select not exists (
        select 1
        from public.memberships m
        join public.workspaces w on w.id = m.workspace_id
        where m.user_id::text = ${userId}::text
          and w.onboarding_completed_at is not null
      ) as required
    `;

    return row?.required === true;
  } catch (error) {
    if (postgresErrorCode(error) !== "42703") throw error;

    const [row] = await database`
      select not exists (
        select 1
        from public.memberships
        where user_id::text = ${userId}::text
      ) as required
    `;

    return row?.required === true;
  }
}
