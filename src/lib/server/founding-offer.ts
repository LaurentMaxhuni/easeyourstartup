import "server-only";

import { createDatabase } from "@/lib/server/database";

export async function getUnallocatedFoundingSlots() {
  const database = createDatabase();
  if (!database) return 0;
  try {
    const [row] = await database`
      select count(*)::integer as remaining
      from public.founding_slots
      where workspace_id is null
    `;
    return Math.max(0, Number(row?.remaining ?? 0));
  } catch {
    console.warn("[founding-offer] Slot availability could not be loaded.");
    return 0;
  }
}

export async function hasUnredeemedFoundingSlot(userId: string) {
  const database = createDatabase();
  if (!database) return false;
  try {
    const [row] = await database`
      select exists (
        select 1
        from public.founding_slots f
        join public.memberships m on m.workspace_id = f.workspace_id
        where m.user_id::text = ${userId}::text and f.redeemed_at is null
      ) as eligible
    `;
    return row?.eligible === true;
  } catch {
    console.warn("[founding-offer] Workspace eligibility could not be loaded.");
    return false;
  }
}
