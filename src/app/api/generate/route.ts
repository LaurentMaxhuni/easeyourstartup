import { NextResponse } from "next/server";
import { generateCampaignSchema } from "@/lib/contracts";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { generateCampaign } from "@/lib/server/campaign-generator";
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
    const identity = getRequestIdentity(request);
    const limit = rateLimit(`generate:${identity}`, {
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Generation limit reached. Try again later." },
        { status: 429 },
      );
    }
    const input = generateCampaignSchema.parse(
      await readJsonBody(request, 96_000),
    );
    const result = await generateCampaign(input);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campaign generation failed.";
    const status = message.startsWith("AI generation is not configured")
      ? 503
      : message.startsWith("AI campaign generation failed")
        ? 502
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
