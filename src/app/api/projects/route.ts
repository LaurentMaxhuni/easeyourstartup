import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { createDatabase } from "@/lib/server/database";
import { listProjectsForUser } from "@/lib/server/project-storage";
import { assertSameOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

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

    const database = createDatabase();
    if (!database) {
      return NextResponse.json(
        { projects: [], persistence: "local" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const projects = await listProjectsForUser(database, auth.user.id);
    return NextResponse.json(
      { projects, persistence: "database" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[projects] Failed to load project list.", error);
    return NextResponse.json(
      { error: "Your projects could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
