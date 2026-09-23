import "server-only";

import { createHash } from "node:crypto";
import {
  studioStateSchema,
  type StudioState,
} from "@/lib/contracts";
import type { DatabaseClient } from "@/lib/server/database";

export function getStudioStorageKey(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  return `easeyourstartup:studio-state:v2:${digest}`;
}

type StateRow = { state?: unknown; revision?: unknown };

function parseRow(row: StateRow | undefined) {
  if (!row) return null;
  const parsed = studioStateSchema.safeParse(row.state);
  if (!parsed.success) {
    console.error("[studio-state] Stored editor snapshot failed validation.");
    return null;
  }
  const revision = Number(row.revision ?? 0);
  return {
    state: parsed.data,
    revision: Number.isSafeInteger(revision) && revision > 0 ? revision : null,
  };
}

export async function loadStudioState(
  database: DatabaseClient,
  userId: string,
  scope: { projectId?: string | null; campaignId?: string | null } = {},
) {
  if (scope.projectId) {
    const [row] = await database`
      select state, revision
      from public.studio_states
      where user_id = ${userId}
        and project_id = ${scope.projectId}::uuid
        and campaign_id is not distinct from ${scope.campaignId ?? null}::uuid
      limit 1
    `;
    const scoped = parseRow(row as StateRow | undefined);
    if (scoped) return scoped;

    // Import a matching legacy snapshot lazily. The original user snapshot is
    // retained until the user deletes their account.
    const [legacyRow] = await database`
      select state, revision
      from public.studio_states
      where user_id = ${userId}
        and project_id is null
      limit 1
    `;
    const legacy = parseRow(legacyRow as StateRow | undefined);
    if (legacy?.state.projectId === scope.projectId && !scope.campaignId) {
      const saved = await saveStudioState(database, userId, legacy.state, null);
      return { state: legacy.state, revision: saved.revision };
    }
    return null;
  }

  const [row] = await database`
    select state, revision
    from public.studio_states
    where user_id = ${userId}
      and project_id is null
    limit 1
  `;
  return parseRow(row as StateRow | undefined);
}

export class StudioStateConflictError extends Error {
  constructor() {
    super("This launch was changed in another tab. Reload the latest version before saving again.");
    this.name = "StudioStateConflictError";
  }
}

export async function saveStudioState(
  database: DatabaseClient,
  userId: string,
  state: StudioState,
  expectedRevision: number | null,
) {
  if (state.projectId) {
    const [row] = await database`
      insert into public.studio_states (
        user_id, project_id, campaign_id, state, revision
      )
      values (
        ${userId},
        ${state.projectId}::uuid,
        ${state.campaignId}::uuid,
        ${JSON.stringify(state)}::jsonb,
        1
      )
      on conflict (
        user_id,
        project_id,
        (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid))
      ) where project_id is not null
      do update set
        state = excluded.state,
        revision = public.studio_states.revision + 1,
        updated_at = now()
      where public.studio_states.revision = ${expectedRevision}
      returning revision, updated_at
    `;
    if (!row) throw new StudioStateConflictError();
    return {
      revision: Number(row.revision),
      savedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === "string"
          ? row.updated_at
          : new Date().toISOString(),
    };
  }

  const [row] = await database`
    insert into public.studio_states (user_id, state, revision)
    values (${userId}, ${JSON.stringify(state)}::jsonb, 1)
    on conflict (user_id) where project_id is null
    do update set
      state = excluded.state,
      revision = public.studio_states.revision + 1,
      updated_at = now()
    returning revision, updated_at
  `;
  return {
    revision: Number(row?.revision ?? 1),
    savedAt: row?.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : typeof row?.updated_at === "string"
        ? row.updated_at
        : new Date().toISOString(),
  };
}
