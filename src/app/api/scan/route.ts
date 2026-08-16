import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_SCAN } from "@/lib/demo-data";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";
import { scanWebsite } from "@/lib/server/scanner";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().max(2048).optional(),
  demo: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await getAuthenticatedUser();
    if (!auth.user) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const identity = getRequestIdentity(request);
    const limit = rateLimit(`scan:${identity}`, {
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Scan limit reached. Try again later." },
        { status: 429 },
      );
    }

    const body = requestSchema.parse(await readJsonBody(request, 16_000));
    if (body.demo) return NextResponse.json(DEMO_SCAN);
    if (!body.url) {
      return NextResponse.json(
        { error: "A public website URL is required." },
        { status: 400 },
      );
    }

    const result = await scanWebsite(body.url);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The website could not be scanned.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
