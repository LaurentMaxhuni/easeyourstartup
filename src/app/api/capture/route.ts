import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { captureWebsite } from "@/lib/server/browserless";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { assertSameOrigin } from "@/lib/server/request-security";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Request origin rejected." }, { status: 403 });
  }
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  const projectId = z.uuid().safeParse(url.searchParams.get("projectId"));
  const viewport =
    url.searchParams.get("viewport") === "mobile" ? "mobile" : "desktop";
  if (!target || !projectId.success) {
    return NextResponse.json({ error: "A saved project and capture target are required." }, { status: 400 });
  }

  let context;
  try {
    context = await requireWorkspaceContext();
  } catch {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const [project] = await context.database`
    select id, public_url from public.projects
    where id = ${projectId.data}::uuid and workspace_id = ${context.workspaceId}
      and status = 'active' and active_slot is not null
      and active_slot <= ${context.limits.activeProjects}
    limit 1
  `;
  if (!project) return NextResponse.json({ error: "Project not found or read-only." }, { status: 404 });
  try {
    const targetHost = new URL(target).hostname.toLowerCase();
    const allowedHosts = new Set<string>();
    if (typeof project.public_url === "string") allowedHosts.add(new URL(project.public_url).hostname.toLowerCase());
    const sourcePages = await context.database`
      select url from public.source_pages
      where project_id = ${projectId.data}::uuid and workspace_id = ${context.workspaceId}
    `;
    for (const page of sourcePages) {
      if (typeof page.url === "string") allowedHosts.add(new URL(page.url).hostname.toLowerCase());
    }
    if (!allowedHosts.has(targetHost)) return NextResponse.json({ error: "Capture target is not part of this project." }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Capture target is invalid." }, { status: 400 });
  }

  const identity = getRequestIdentity(request, context.workspaceId);
  const limit = await rateLimit(`capture:${identity}`, {
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Capture limit reached." },
      { status: 429 },
    );
  }

  try {
    const result = await captureWebsite(target, viewport);
    return new NextResponse(result.buffer, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Capture failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
