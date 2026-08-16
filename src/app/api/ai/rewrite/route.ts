import { NextResponse } from "next/server";
import { creativeRewriteSchema } from "@/lib/contracts";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { rewriteCreativeText } from "@/lib/server/campaign-generator";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

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

    const limit = rateLimit(`ai-rewrite:${getRequestIdentity(request)}`, {
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "AI rewrite limit reached. Try again later." },
        { status: 429 },
      );
    }

    const input = creativeRewriteSchema.parse(
      await readJsonBody(request, 12_000),
    );
    const result = await rewriteCreativeText(input);
    return NextResponse.json({ ...result, mode: "ai" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI rewrite failed.";
    const status = message.startsWith("AI rewriting is not configured")
      ? 503
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
