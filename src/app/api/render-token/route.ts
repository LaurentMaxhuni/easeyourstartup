import { NextResponse } from "next/server";
import { creativeCompositionSchema } from "@/lib/contracts";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { createRenderToken } from "@/lib/server/render-token";
import {
  assertSameOrigin,
  readJsonBody,
} from "@/lib/server/request-security";

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
    const composition = creativeCompositionSchema.parse(
      await readJsonBody(request, 64_000),
    );
    const imageUrls = [
      composition.screenshotUrl,
      composition.mockups.desktop,
      composition.mockups.tablet,
      composition.mockups.phone,
    ];
    if (
      imageUrls.some(
        (url) => url.startsWith("data:") || url.startsWith("blob:"),
      )
    ) {
      return NextResponse.json(
        { error: "Store all creative images before server rendering." },
        { status: 400 },
      );
    }
    const token = createRenderToken(composition);
    if (!token) {
      return NextResponse.json(
        { error: "Rendering is not configured." },
        { status: 503 },
      );
    }
    return NextResponse.json({ url: `/render/${token}` });
  } catch {
    return NextResponse.json(
      { error: "Render request rejected." },
      { status: 400 },
    );
  }
}
