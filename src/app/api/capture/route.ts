import { NextResponse } from "next/server";
import { captureWebsite } from "@/lib/server/browserless";
import { authorizeProjectCapture } from "@/lib/server/capture-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await authorizeProjectCapture(request);
  if (access instanceof NextResponse) return access;
  const { target, searchParams } = access;
  const viewport =
    searchParams.get("viewport") === "mobile" ? "mobile" : "desktop";

  try {
    const result = await captureWebsite(target, viewport, {
      fullPage: searchParams.get("preview") !== "1",
    });
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
