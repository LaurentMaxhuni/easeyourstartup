import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { studioStateSchema } from "@/lib/contracts";
import { createDatabase } from "@/lib/server/database";
import {
  getStudioStorageKey,
  loadStudioState,
  saveStudioState,
} from "@/lib/server/studio-state";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

const MAX_STATE_BYTES = 3_000_000;

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const database = createDatabase();
    if (!database) {
      return NextResponse.json({
        state: null,
        persistence: "local",
        storageKey: getStudioStorageKey(user.id),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const state = await loadStudioState(database, user.id);
    return NextResponse.json({
      state,
      persistence: "database",
      storageKey: getStudioStorageKey(user.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[studio-state] Failed to load editor snapshot.", error);
    return NextResponse.json(
      { error: "The saved studio state could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const state = studioStateSchema.parse(
      await readJsonBody(request, MAX_STATE_BYTES),
    );
    const database = createDatabase();
    if (!database) {
      return NextResponse.json(
        { error: "Database persistence is not configured." },
        { status: 503 },
      );
    }

    const savedAt = await saveStudioState(database, user.id, state);
    return NextResponse.json({
      ok: true,
      persistence: "database",
      savedAt,
    });
  } catch (error) {
    console.error("[studio-state] Failed to save editor snapshot.", error);
    const message = error instanceof Error && /too large|valid JSON|Request body/.test(error.message)
      ? error.message
      : "The studio state could not be saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
