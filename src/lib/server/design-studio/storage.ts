import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { designDocumentSchema, brandKitSchema, designAssetSchema, type DesignDocument } from "@/lib/design-studio/document";
import { designJobInputSchema, type DesignJobInput } from "@/lib/design-studio/workflow";
import type { DatabaseClient } from "@/lib/server/database";

export class DesignConflictError extends Error {
  constructor() { super("This design changed in another tab. Reload its latest version before saving."); }
}
export class DesignAssetError extends Error {}
export class DesignJobStateError extends Error {}
export async function validateApprovedDesignAssets(assets: DesignDocument["assets"]) {
  for (const asset of assets) {
    const bytes = Buffer.from(asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1), "base64");
    let metadata;
    try {
      const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning", animated: true });
      metadata = await image.metadata();
      if (["png", "jpeg", "webp"].includes(metadata.format || "")) await image.stats();
    }
    catch { throw new DesignAssetError("An asset is not a valid approved raster image. Upload it through the asset panel first."); }
    if (!["png", "jpeg", "webp"].includes(metadata.format || "") || !metadata.width || !metadata.height ||
      metadata.width * metadata.height > 20_000_000 || (metadata.pages ?? 1) > 1 || metadata.exif || metadata.xmp || metadata.iptc) {
      throw new DesignAssetError("Use approved static PNG, JPEG or WebP assets without metadata. Upload the image through the asset panel first.");
    }
    const declaredFormat = /^data:image\/(png|jpeg|webp);/.exec(asset.dataUrl)?.[1];
    if (declaredFormat !== metadata.format) throw new DesignAssetError("The asset MIME type does not match its raster data.");
  }
}
export type DesignRecord = { id: string; title: string; document: DesignDocument; revision: number; updatedAt: string };
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function designRecord(row: Record<string, unknown>): DesignRecord {
  return { id: String(row.id), title: String(row.title), document: designDocumentSchema.parse(row.document), revision: Number(row.revision), updatedAt: iso(row.updated_at) };
}
export async function listDesigns(database: DatabaseClient, workspaceId: string) {
  const rows = await database`select id, title, document, revision, updated_at from public.design_documents where workspace_id = ${workspaceId}::uuid order by updated_at desc limit 12`;
  return rows.map(designRecord);
}
export async function getDesign(database: DatabaseClient, workspaceId: string, id: string) {
  const [row] = await database`select id, title, document, revision, updated_at from public.design_documents where id = ${id}::uuid and workspace_id = ${workspaceId}::uuid`;
  if (!row) return null;
  const versions = await database`select id, revision, document, created_at from public.design_versions where design_id = ${id}::uuid and workspace_id = ${workspaceId}::uuid order by revision desc limit 30`;
  return { design: designRecord(row), versions: versions.map((version) => ({ id: version.id, revision: Number(version.revision), document: designDocumentSchema.parse(version.document), createdAt: iso(version.created_at) })) };
}
export async function saveDesign(database: DatabaseClient, workspaceId: string, input: { id?: string; revision?: number; document: DesignDocument }) {
  const document = designDocumentSchema.parse(input.document);
  await validateApprovedDesignAssets(document.assets);
  const id = input.id ?? randomUUID();
  // One statement: the revision and its immutable history snapshot commit atomically.
  const rows = input.id ? await database`
    with saved as (
      update public.design_documents set document = ${JSON.stringify(document)}::jsonb,
        title = ${document.title}, revision = revision + 1, updated_at = now()
      where id = ${id}::uuid and workspace_id = ${workspaceId}::uuid and revision = ${input.revision ?? 0}
      returning *
    ), snapshot as (
      insert into public.design_versions (design_id, workspace_id, revision, document)
      select id, workspace_id, revision, document from saved returning id
    ) select id, title, document, revision, updated_at from saved
  ` : await database`
    with saved as (
      insert into public.design_documents (id, workspace_id, title, document)
      values (${id}::uuid, ${workspaceId}::uuid, ${document.title}, ${JSON.stringify(document)}::jsonb) returning *
    ), snapshot as (
      insert into public.design_versions (design_id, workspace_id, revision, document)
      select id, workspace_id, revision, document from saved returning id
    ) select id, title, document, revision, updated_at from saved
  `;
  if (!rows[0]) throw new DesignConflictError();
  return designRecord(rows[0]);
}
export async function listBrandKits(database: DatabaseClient, workspaceId: string) {
  const rows = await database`select id, name, kit, assets from public.design_brand_kits where workspace_id = ${workspaceId}::uuid order by updated_at desc limit 30`;
  return rows.map((row) => ({ id: row.id, name: row.name, kit: brandKitSchema.parse(row.kit), assets: z.array(designAssetSchema).parse(row.assets) }));
}
export async function saveBrandKit(database: DatabaseClient, workspaceId: string, raw: { id?: string; kit: unknown; assets: unknown }) {
  const kit = brandKitSchema.parse(raw.kit);
  const assets = z.array(designAssetSchema).max(12).parse(raw.assets);
  await validateApprovedDesignAssets(assets);
  const id = raw.id ?? randomUUID();
  const [row] = raw.id ? await database`
    update public.design_brand_kits set name = ${kit.name}, kit = ${JSON.stringify(kit)}::jsonb,
      assets = ${JSON.stringify(assets)}::jsonb, updated_at = now()
    where id = ${id}::uuid and workspace_id = ${workspaceId}::uuid returning id
  ` : await database`
    insert into public.design_brand_kits (id, workspace_id, name, kit, assets)
    values (${id}::uuid, ${workspaceId}::uuid, ${kit.name}, ${JSON.stringify(kit)}::jsonb, ${JSON.stringify(assets)}::jsonb) returning id
  `;
  if (!row) throw new DesignConflictError();
  return { id, name: kit.name, kit, assets };
}
export async function createDesignJob(database: DatabaseClient, workspaceId: string, raw: DesignJobInput) {
  const input = designJobInputSchema.parse(raw);
  await validateApprovedDesignAssets(input.action === "edit" ? input.document.assets : input.assets);
  const concurrency = Math.max(1, Math.min(8, Number(process.env.DESIGN_WORKSPACE_CONCURRENCY) || 2));
  const [row] = await database`
    select id, status, stage, attempt from public.enqueue_design_job(
      ${workspaceId}::uuid, ${JSON.stringify(input)}::jsonb, ${concurrency})
  `;
  if (!row) throw new DesignJobStateError("Your workspace has reached its concurrent design job limit. Cancel a job or wait for it to finish.");
  return row;
}
export async function getDesignJob(database: DatabaseClient, workspaceId: string, id: string) {
  const [row] = await database`select id, status, stage, attempt, result, preview, error, updated_at from public.design_jobs where id = ${id}::uuid and workspace_id = ${workspaceId}::uuid`;
  return row ?? null;
}
export async function changeDesignJob(database: DatabaseClient, workspaceId: string, id: string, action: "cancel" | "retry") {
  const [row] = action === "cancel" ? await database`
    update public.design_jobs set status = 'cancelled', stage = 'Cancelled', updated_at = now()
    where id = ${id}::uuid and workspace_id = ${workspaceId}::uuid and status in ('queued','running')
    returning id, status, stage, attempt, result
  ` : await database`
    select id, status, stage, attempt, result from public.retry_design_job(
      ${workspaceId}::uuid, ${id}::uuid, ${Math.max(1, Math.min(8, Number(process.env.DESIGN_WORKSPACE_CONCURRENCY) || 2))})
  `;
  if (!row) throw new DesignJobStateError("This job cannot be changed in its current state or the workspace is at its concurrency limit.");
  return row;
}
