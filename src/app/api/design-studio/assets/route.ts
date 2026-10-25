import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { designAssetSchema } from "@/lib/design-studio/document";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { assertSameOrigin, readBoundedBody } from "@/lib/server/request-security";
import { rateLimit } from "@/lib/server/rate-limit";
import { designHttpError, DesignHttpError } from "@/lib/server/design-studio/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { workspaceId } = await requireWorkspaceContext();
    if (!(await rateLimit(`design-assets:${workspaceId}`, { limit: 30, windowMs: 3600000 })).allowed) throw new DesignHttpError("Asset upload limit reached.", 429);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data;")) throw new DesignHttpError("Choose a PNG, JPEG or WebP upload.", 415);
    const bytes = await readBoundedBody(request, 10_500_000);
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: new Uint8Array(bytes) }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size) throw new DesignHttpError("Choose a PNG, JPEG or WebP image.", 415);
    const kind = z.enum(["logo", "image", "reference"]).parse(form.get("kind") || "image");
    const description = z.string().max(600).parse(form.get("description") || "");
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new DesignHttpError("This image format is not supported.", 415);
    const output = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    if (output.length > 2_000_000) throw new DesignHttpError("Use a smaller image (processed limit 2 MB).", 413);
    const asset = designAssetSchema.parse({ id: randomUUID(), name: file.name.slice(0, 120), kind, description, dataUrl: `data:image/webp;base64,${output.toString("base64")}` });
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return designHttpError(error); }
}
