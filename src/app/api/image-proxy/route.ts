import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { safeFetchImage } from "@/lib/server/url-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let context;
  try {
    context = await requireWorkspaceContext();
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 503;
    return NextResponse.json(
      { error: status === 503 ? "Image proxy is unavailable." : "Sign in required." },
      { status },
    );
  }
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { error: "Missing image target." },
      { status: 400 },
    );
  }

  const identity = getRequestIdentity(request, context.workspaceId);
  const limit = await rateLimit(`image-proxy:${identity}`, {
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Image proxy limit reached." },
      { status: 429 },
    );
  }

  try {
    const result = await safeFetchImage(target);
    return new NextResponse(result.buffer, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The source image could not be loaded." },
      { status: 400 },
    );
  }
}
