import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { captureWebsite } from "@/lib/server/browserless";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  const viewport =
    url.searchParams.get("viewport") === "mobile" ? "mobile" : "desktop";
  if (!target) {
    return NextResponse.json({ error: "Missing capture target." }, { status: 400 });
  }

  const identity = getRequestIdentity(request);
  const limit = rateLimit(`capture:${identity}`, {
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
