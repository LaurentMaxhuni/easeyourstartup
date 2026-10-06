import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { onboardingSubmissionSchema } from "@/lib/onboarding";
import { createDatabase } from "@/lib/server/database";
import { ensureWorkspaceForUser } from "@/lib/server/workspace-access";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  }

  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 16_000);
  } catch {
    return NextResponse.json({ error: "Enter valid onboarding details." }, { status: 400 });
  }

  const parsed = onboardingSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check your onboarding details." },
      { status: 400 },
    );
  }

  const database = createDatabase();
  if (!database) {
    return NextResponse.json(
      { error: "Workspace setup is not available because the database is not configured." },
      { status: 503 },
    );
  }

  try {
    const [migration] = await database`
      select count(*)::integer as available
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'workspaces'
        and column_name in ('onboarding_profile', 'onboarding_completed_at')
    `;
    if (Number(migration?.available ?? 0) !== 2) {
      return NextResponse.json(
        { error: "Workspace setup needs the latest database migration. Apply migrations and try again." },
        { status: 503 },
      );
    }

    const workspaceId = await ensureWorkspaceForUser(
      database,
      auth.user.id,
      parsed.data.organizationName,
    );
    const [workspace] = await database`
      update public.workspaces
      set
        name = ${parsed.data.organizationName},
        onboarding_profile = ${JSON.stringify({
          websiteUrl: parsed.data.websiteUrl,
          role: parsed.data.role,
          launchGoal: parsed.data.launchGoal,
          channels: parsed.data.channels,
        })}::jsonb,
        onboarding_completed_at = coalesce(onboarding_completed_at, now())
      where id = ${workspaceId}::uuid
        and owner_user_id = ${auth.user.id}::uuid
      returning id
    `;

    if (!workspace) {
      return NextResponse.json(
        { error: "You do not have permission to set up this workspace." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { completed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[onboarding] Workspace setup could not be saved.", error);
    return NextResponse.json(
      { error: "Your setup could not be saved. Try again in a moment." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
