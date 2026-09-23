import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { AuthenticationRequiredError } from "@/lib/auth/server";
import { getRequestIdentity, rateLimit } from "@/lib/server/rate-limit";
import { assertSameOrigin, readBoundedBody } from "@/lib/server/request-security";
import { deletePrivateObject, putPrivateObject } from "@/lib/server/object-storage";
import { requireWorkspaceContext } from "@/lib/server/workspace-access";
import { z } from "zod";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireWorkspaceContext();
    const limit = await rateLimit(`upload:${getRequestIdentity(request, context.workspaceId)}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.allowed) return NextResponse.json({ error: "Upload limit reached." }, { status: 429 });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Choose an image upload." }, { status: 415 });
    }
    const body = await readBoundedBody(request, MAX_BYTES + 100_000);
    const bodyBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(bodyBuffer).set(body);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bodyBuffer,
    }).formData();
    const file = form.get("file");
    const projectId = z.uuid().safeParse(form.get("projectId"));
    const campaignValue = form.get("campaignId");
    const campaignId = campaignValue ? z.uuid().safeParse(campaignValue) : null;
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Use a PNG, JPEG, or WebP image." }, { status: 415 });
    if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Screenshot must be 10 MB or smaller." }, { status: 413 });
    if (!projectId.success || (campaignValue && !campaignId?.success)) {
      return NextResponse.json({ error: "Choose a saved project before uploading an image." }, { status: 400 });
    }

    const [project] = await context.database`
      select id from public.projects
      where id = ${projectId.data}::uuid and workspace_id = ${context.workspaceId}
        and status = 'active' and active_slot is not null
        and active_slot <= ${context.limits.activeProjects}
      limit 1
    `;
    if (!project) return NextResponse.json({ error: "Project not found or read-only." }, { status: 404 });
    if (campaignId?.success) {
      const [campaign] = await context.database`
        select id from public.campaigns
        where id = ${campaignId.data}::uuid and project_id = ${projectId.data}::uuid
          and workspace_id = ${context.workspaceId}
          and status <> 'archived'
        limit 1
      `;
      if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) return NextResponse.json({ error: "The image could not be decoded." }, { status: 400 });
    const { data: output, info } = await image
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    if (output.byteLength > 12_000_000) return NextResponse.json({ error: "Processed image is too large." }, { status: 413 });

    const id = randomUUID();
    const objectKey = `assets/${context.workspaceId}/${id}.webp`;
    const stored = await putPrivateObject(objectKey, output, "image/webp");
    try {
      await context.database`
        insert into public.stored_assets (
          id, workspace_id, owner_user_id, project_id, campaign_id,
          object_key, mime_type, width, height, byte_size, sha256
        )
        values (
          ${id}::uuid, ${context.workspaceId}::uuid, ${context.user.id}::text,
          ${projectId.data}::uuid, ${campaignId?.success ? campaignId.data : null}::uuid,
          ${objectKey}, 'image/webp', ${info.width}, ${info.height},
          ${stored.byteSize}, ${stored.sha256}
        )
      `;
    } catch (error) {
      await deletePrivateObject(objectKey).catch(() => undefined);
      throw error;
    }

    return NextResponse.json({
      assetId: id,
      url: `/api/assets/${id}`,
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      metadataStripped: true,
    });
  } catch (error) {
    console.error("[uploads] Upload could not be stored.", error);
    const status = error instanceof AuthenticationRequiredError
      ? error.status
      : error instanceof Error && error.message.includes("not configured") ? 503 : 400;
    return NextResponse.json({ error: status === 503 ? "Private object storage is not configured." : "The screenshot could not be processed or stored." }, { status });
  }
}
