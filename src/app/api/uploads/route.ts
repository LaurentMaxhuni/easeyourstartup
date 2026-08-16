import { NextResponse } from "next/server";
import sharp from "sharp";
import { getAuthenticatedUser } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

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
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES + 100_000) {
      return NextResponse.json(
        { error: "Screenshot must be 10 MB or smaller." },
        { status: 413 },
      );
    }
    const identity = getRequestIdentity(request);
    const limit = rateLimit(`upload:${identity}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Upload limit reached." },
        { status: 429 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an image." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type) || file.type === "image/svg+xml") {
      return NextResponse.json(
        { error: "Use a PNG, JPEG, or WebP image." },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Screenshot must be 10 MB or smaller." },
        { status: 413 },
      );
    }

    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: "The image could not be decoded." },
        { status: 400 },
      );
    }
    const output = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90, smartSubsample: true })
      .toBuffer();

    return NextResponse.json({
      url: `data:image/webp;base64,${output.toString("base64")}`,
      width: metadata.width,
      height: metadata.height,
      metadataStripped: true,
    });
  } catch {
    return NextResponse.json(
      { error: "The screenshot could not be processed." },
      { status: 400 },
    );
  }
}
