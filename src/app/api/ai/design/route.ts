import { NextResponse } from "next/server";
import { creativeDesignRequestSchema } from "@/lib/contracts";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { designCreativeComposition } from "@/lib/server/campaign-generator";
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

    const limit = rateLimit(`ai-design:${getRequestIdentity(request)}`, {
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "AI design limit reached. Try again later." },
        { status: 429 },
      );
    }

    const input = creativeDesignRequestSchema.parse(
      await readJsonBody(request, 64_000),
    );
    const generation = await designCreativeComposition(input);
    return NextResponse.json({ ...generation, mode: "ai" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI design failed.";
    const status = message.startsWith("AI design is not configured")
      ? 503
      : message.startsWith("The AI provider could not design this canvas")
        ? 502
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
