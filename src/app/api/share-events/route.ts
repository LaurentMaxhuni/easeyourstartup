import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

const eventSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
  event: z.enum(["copy", "download"]),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status },
      );
    }
    const identity = getRequestIdentity(request);
    const limit = rateLimit(`share:${identity}`, {
      limit: 50,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    eventSchema.parse(await readJsonBody(request, 4_000));

    // The MVP intentionally records no visitor identity. A production
    // deployment can append this anonymous event to audit_events.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
