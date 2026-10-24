import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { emptyDesignDocument } from "@/lib/design-studio/document";
import { generationInputSchema } from "@/lib/design-studio/workflow";
import type { DatabaseClient } from "@/lib/server/database";
import { changeDesignJob, createDesignJob, DesignConflictError, getDesign, getDesignJob, listBrandKits, listDesigns, saveBrandKit, saveDesign } from "./storage";

vi.mock("server-only", () => ({}));
const workspaceId = "11111111-1111-4111-8111-111111111111";
const designId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
afterEach(() => vi.unstubAllEnvs());

function databaseWith(rows: Record<string, unknown>[][] = []) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const call = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return rows.shift() ?? [];
  });
  return { database: call as unknown as DatabaseClient, call, queries };
}
function savedRow(revision = 1) {
  return { id: designId, title: "Untitled design", document: emptyDesignDocument(), revision, updated_at: new Date("2026-10-25T00:00:00.000Z") };
}

describe("design storage query boundaries", () => {
  it("creates a design and immutable snapshot in one SQL statement scoped to its workspace", async () => {
    const { database, call, queries } = databaseWith([[savedRow()]]);
    const result = await saveDesign(database, workspaceId, { document: emptyDesignDocument() });
    expect(result).toMatchObject({ id: designId, revision: 1, updatedAt: "2026-10-25T00:00:00.000Z" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(queries[0].sql).toMatch(/with saved as \( insert into public\.design_documents/);
    expect(queries[0].sql).toMatch(/insert into public\.design_versions \(design_id, workspace_id, revision, document\) select id, workspace_id, revision, document from saved/);
    expect(queries[0].values).toContain(workspaceId);
    expect(queries[0].values.filter((value) => typeof value === "string" && value.startsWith("{"))).toEqual([JSON.stringify(emptyDesignDocument())]);
  });

  it("updates only the supplied workspace and revision before atomically adding history", async () => {
    const { database, call, queries } = databaseWith([[savedRow(4)]]);
    const doc = emptyDesignDocument();
    const before = structuredClone(doc);
    expect(await saveDesign(database, workspaceId, { id: designId, revision: 3, document: doc })).toMatchObject({ revision: 4 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(queries[0].sql).toMatch(/where id = \?::uuid and workspace_id = \?::uuid and revision = \?/);
    expect(queries[0].values.slice(-3)).toEqual([designId, workspaceId, 3]);
    expect(queries[0].sql).toMatch(/insert into public\.design_versions[\s\S]*from saved/);
    expect(doc).toEqual(before);
  });

  it("rejects a stale revision without retrying an unguarded write or adding a separate snapshot", async () => {
    const { database, call, queries } = databaseWith([[]]);
    await expect(saveDesign(database, workspaceId, { id: designId, revision: 2, document: emptyDesignDocument() })).rejects.toBeInstanceOf(DesignConflictError);
    expect(call).toHaveBeenCalledTimes(1);
    expect(queries[0].values.slice(-3)).toEqual([designId, workspaceId, 2]);
  });

  it("does not query version history after a foreign or absent design", async () => {
    const { database, call, queries } = databaseWith([[]]);
    expect(await getDesign(database, workspaceId, designId)).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
    expect(queries[0]).toMatchObject({ values: [designId, workspaceId] });
    expect(queries[0].sql).toMatch(/where id = \?::uuid and workspace_id = \?::uuid/);
  });

  it("scopes both a design and its version history to the authenticated workspace", async () => {
    const { database, queries } = databaseWith([[savedRow()], [{ id: "version-1", revision: 1, document: emptyDesignDocument(), created_at: new Date("2026-10-25T00:00:00Z") }]]);
    const result = await getDesign(database, workspaceId, designId);
    expect(result?.versions[0]).toMatchObject({ revision: 1, createdAt: "2026-10-25T00:00:00.000Z" });
    expect(queries).toHaveLength(2);
    expect(queries[1].sql).toMatch(/where design_id = \?::uuid and workspace_id = \?::uuid/);
    expect(queries[1].values).toEqual([designId, workspaceId]);
  });

  it("scopes document, brand-kit and job reads to the workspace", async () => {
    const { database, queries } = databaseWith([[], [], []]);
    expect(await listDesigns(database, workspaceId)).toEqual([]);
    expect(await listBrandKits(database, workspaceId)).toEqual([]);
    expect(await getDesignJob(database, workspaceId, jobId)).toBeNull();
    expect(queries.map((query) => query.values)).toEqual([[workspaceId], [workspaceId], [jobId, workspaceId]]);
    for (const query of queries) expect(query.sql).toMatch(/where (?:id = \?::uuid and )?workspace_id = \?::uuid/);
  });

  it("cancels only a queued or running job belonging to this workspace", async () => {
    const { database, queries } = databaseWith([[{ id: jobId, status: "cancelled", attempt: 2 }]]);
    expect(await changeDesignJob(database, workspaceId, jobId, "cancel")).toMatchObject({ status: "cancelled", attempt: 2 });
    expect(queries[0].sql).toMatch(/where id = \?::uuid and workspace_id = \?::uuid and status in \('queued','running'\)/);
    expect(queries[0].values).toEqual([jobId, workspaceId]);
  });

  it("passes the workspace, target job and bounded concurrency to the atomic retry function", async () => {
    vi.stubEnv("DESIGN_WORKSPACE_CONCURRENCY", "999");
    const { database, queries } = databaseWith([[{ id: jobId, status: "queued", attempt: 3 }]]);
    expect(await changeDesignJob(database, workspaceId, jobId, "retry")).toMatchObject({ attempt: 3 });
    expect(queries[0].sql).toMatch(/from public\.retry_design_job\(/);
    expect(queries[0].values).toEqual([workspaceId, jobId, 8]);
  });

  it.each(["cancel", "retry"] as const)("does not return another workspace's job when %s affects no rows", async (action) => {
    const { database, call } = databaseWith([[]]);
    await expect(changeDesignJob(database, workspaceId, jobId, action)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("uses the atomic workspace concurrency function to enqueue validated input", async () => {
    vi.stubEnv("DESIGN_WORKSPACE_CONCURRENCY", "-10");
    const input = generationInputSchema.parse({ action: "generate", prompt: "Build a release poster", brand: {} });
    const { database, queries } = databaseWith([[{ id: jobId, status: "queued", stage: "Queued", attempt: 1 }]]);
    expect(await createDesignJob(database, workspaceId, input)).toMatchObject({ id: jobId, attempt: 1 });
    expect(queries[0].sql).toMatch(/from public\.enqueue_design_job\(/);
    expect(queries[0].values).toEqual([workspaceId, JSON.stringify(input), 1]);
  });

  it("guards brand-kit updates with both identifiers", async () => {
    const { database, queries } = databaseWith([[{ id: designId }]]);
    await saveBrandKit(database, workspaceId, { id: designId, kit: {}, assets: [] });
    expect(queries[0].sql).toMatch(/where id = \?::uuid and workspace_id = \?::uuid/);
    expect(queries[0].values.slice(-2)).toEqual([designId, workspaceId]);
  });

  it.each([
    "https://example.com/image.png",
    "data:image/svg+xml;base64,PHN2Zy8+",
    `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="http://127.0.0.1/private"/></svg>').toString("base64")}`,
  ])("rejects unsafe assets before saving documents, brand kits or job input: %s", async (dataUrl) => {
    const { database, call } = databaseWith();
    const doc = emptyDesignDocument();
    const asset = { id: "unsafe", name: "Unsafe", kind: "image" as const, description: "", dataUrl };
    doc.assets = [asset];
    await expect(saveDesign(database, workspaceId, { document: doc })).rejects.toThrow();
    await expect(saveBrandKit(database, workspaceId, { kit: {}, assets: [asset] })).rejects.toThrow();
    const input = { ...generationInputSchema.parse({ action: "generate", prompt: "Build a release poster", brand: {} }), assets: [asset] };
    await expect(createDesignJob(database, workspaceId, input)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects raster files whose readable headers hide a truncated pixel payload", async () => {
    const complete = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#f05228" } }).png().toBuffer();
    const doc = emptyDesignDocument();
    doc.assets = [{ id: "truncated", name: "Truncated PNG", kind: "image", description: "", dataUrl: `data:image/png;base64,${complete.subarray(0, 55).toString("base64")}` }];
    const { database, call } = databaseWith([[savedRow()]]);
    await expect(saveDesign(database, workspaceId, { document: doc })).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });

  it("accepts a decoded approved raster without altering its document", async () => {
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#f05228" } }).png().toBuffer();
    const doc = emptyDesignDocument();
    doc.assets = [{ id: "approved", name: "Approved PNG", kind: "image", description: "", dataUrl: `data:image/png;base64,${png.toString("base64")}` }];
    const { database, queries } = databaseWith([[{ ...savedRow(), document: doc }]]);
    const result = await saveDesign(database, workspaceId, { document: doc });
    expect(result.document).toEqual(doc);
    expect(queries).toHaveLength(1);
    expect(JSON.parse(queries[0].values.find((value): value is string => typeof value === "string" && value.startsWith("{"))!)).toEqual(doc);
  });

  it("rejects MIME mismatches and embedded metadata before persisting a brand kit", async () => {
    const image = sharp({ create: { width: 32, height: 32, channels: 3, background: "#f05228" } });
    const jpeg = await image.clone().jpeg().toBuffer();
    const taggedPng = await image.clone().withMetadata().png().toBuffer();
    const { database, call } = databaseWith();
    for (const bytes of [jpeg, taggedPng]) {
      await expect(saveBrandKit(database, workspaceId, { kit: {}, assets: [{ id: "unsafe", name: "Unsafe", kind: "image", dataUrl: `data:image/png;base64,${bytes.toString("base64")}` }] })).rejects.toThrow();
    }
    expect(call).not.toHaveBeenCalled();
  });
});
