import "server-only";

import { createHash } from "node:crypto";
import {
  studioStateSchema,
  type StudioState,
} from "@/lib/contracts";
import type { DatabaseClient } from "@/lib/server/database";

let studioStateTableReady: Promise<void> | null = null;

export function getStudioStorageKey(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  return `easeyourstartup:studio-state:v1:${digest}`;
}

async function ensureStudioStateTable(database: DatabaseClient) {
  if (!studioStateTableReady) {
    studioStateTableReady = database`
      create table if not exists public.studio_states (
        user_id text primary key,
        state jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.then(() => undefined).catch((error) => {
      studioStateTableReady = null;
      throw error;
    });
  }
  await studioStateTableReady;
}

export async function loadStudioState(
  database: DatabaseClient,
  userId: string,
): Promise<StudioState | null> {
  await ensureStudioStateTable(database);
  const [row] = await database`
    select state
    from public.studio_states
    where user_id = ${userId}
    limit 1
  `;
  if (!row || typeof row !== "object") return null;

  const parsed = studioStateSchema.safeParse(
    (row as { state?: unknown }).state,
  );
  if (!parsed.success) {
    console.error("[studio-state] Stored editor snapshot failed validation.");
    return null;
  }
  return parsed.data;
}

export async function saveStudioState(
  database: DatabaseClient,
  userId: string,
  state: StudioState,
) {
  await ensureStudioStateTable(database);
  const [row] = await database`
    insert into public.studio_states (user_id, state)
    values (${userId}, ${JSON.stringify(state)}::jsonb)
    on conflict (user_id)
    do update set
      state = excluded.state,
      updated_at = now()
    returning updated_at
  `;
  const updatedAt = row && typeof row === "object"
    ? (row as { updated_at?: unknown }).updated_at
    : undefined;
  return updatedAt instanceof Date
    ? updatedAt.toISOString()
    : typeof updatedAt === "string"
      ? updatedAt
      : new Date().toISOString();
}
