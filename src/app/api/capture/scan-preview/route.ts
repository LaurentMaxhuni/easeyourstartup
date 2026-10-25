import { NextResponse } from "next/server";
import { captureScanPreview, SCAN_PREVIEW_VIEWPORT } from "@/lib/server/browserless";
import { authorizeProjectCapture } from "@/lib/server/capture-access";

export const runtime = "nodejs";

// Viewport screenshot plus the positions of the elements the scanner reads,
// used by the website step's live scan animation.
export async function GET(request: Request) {
  const access = await authorizeProjectCapture(request);
  if (access instanceof NextResponse) return access;

  try {
    const preview = await captureScanPreview(access.target);
    return NextResponse.json(
      {
        ...preview,
        image: `data:image/jpeg;base64,${preview.image}`,
        viewport: SCAN_PREVIEW_VIEWPORT,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Capture failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
