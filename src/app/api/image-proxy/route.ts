import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { safeFetchImage } from "@/lib/server/url-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { error: "Missing image target." },
      { status: 400 },
    );
  }

  const identity = getRequestIdentity(request);
  const limit = rateLimit(`image-proxy:${identity}`, {
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
