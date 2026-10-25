import { NextResponse } from "next/server";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import {
  announcementSuggestionInputSchema,
  suggestAnnouncement,
} from "@/lib/server/announcement-suggestions";
import { publicProviderError } from "@/lib/server/campaign-generator";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin, readJsonBody } from "@/lib/server/request-security";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const input = announcementSuggestionInputSchema.parse(await readJsonBody(request, 24_000));
    const limit = await rateLimit(
      `announcement-suggest:${input.mode}:${getRequestIdentity(request, context.workspaceId)}`,
      input.mode === "draft"
        ? { limit: 30, windowMs: 60 * 60 * 1000 }
        : { limit: 120, windowMs: 60 * 60 * 1000 },
    );
    if (!limit.allowed) {
      return NextResponse.json({ error: "Suggestion limit reached. Try again later." }, { status: 429 });
    }
    try {
      return NextResponse.json(await suggestAnnouncement(input));
    } catch (error) {
      console.error(`[announcement-suggest] ${publicProviderError(error)}`);
      return NextResponse.json(
        { error: "We couldn't write a draft right now. Write it yourself or try again." },
        { status: 503 },
      );
    }
  } catch (error) {
    const status = error instanceof AuthenticationRequiredError ? error.status : 400;
    const message = error instanceof AuthenticationRequiredError
      ? error.message
      : "The suggestion request was invalid.";
    return NextResponse.json({ error: message }, { status });
  }
}
