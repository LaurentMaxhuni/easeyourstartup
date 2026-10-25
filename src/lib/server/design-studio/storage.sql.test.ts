import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/server/database";
import { emptyDesignDocument } from "@/lib/design-studio/document";
import { generationInputSchema } from "@/lib/design-studio/workflow";
vi.mock("server-only", () => ({}));
import { saveDesign, getDesign, createDesignJob, changeDesignJob, getDesignJob } from "./storage";

// Optional PostgreSQL WASM integration: isolated, synthetic data, no network or
// configured DATABASE_URL. See docs/design-studio.md for the one-off setup.
describe.skipIf(process.env.RUN_DESIGN_SQL_TESTS !== "true")("design studio PostgreSQL migration and persistence", () => {
  let pg: { exec: (sql: string) => Promise<unknown>; query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
  let database: DatabaseClient;
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  let designId: string;
  let jobId: string;
  beforeAll(async () => {
    const require = createRequire(path.resolve("output/design-studio/postgres-check/package.json"));
    const { PGlite } = require("@electric-sql/pglite");
    pg = await PGlite.create();
    await pg.exec(`create table public.workspaces(id uuid primary key);
      create table public.account_deletion_requests(workspace_id uuid primary key, expires_at timestamptz not null);`);
    const guard = readFileSync("migrations/0026_account_lifecycle_guards.sql", "utf8").match(/create or replace function public\.guard_pending_account_work\(\)[\s\S]*?\$\$;/)?.[0];
    if (!guard) throw new Error("Existing account lifecycle guard not found.");
    await pg.exec(guard);
    await pg.exec(readFileSync("migrations/0028_ai_design_studio.sql", "utf8"));
    await pg.query("insert into public.workspaces(id) values ($1),($2)", [workspaceId, otherWorkspaceId]);
    database = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((text, piece, index) => text + piece + (index < values.length ? `$${index + 1}` : ""), "");
      return (await pg.query(sql, values)).rows;
    }) as unknown as DatabaseClient;
  }, 30000);
  afterAll(async () => { await pg?.close(); });
  it("saves immutable revisions atomically and rejects stale or foreign writes", async () => {
    const first = await saveDesign(database, workspaceId, { document: emptyDesignDocument() });
    designId = first.id;
    const changed = { ...first.document, title: "A precise launch" };
    const second = await saveDesign(database, workspaceId, { id: designId, revision: 1, document: changed });
    expect(second.revision).toBe(2);
    await expect(saveDesign(database, workspaceId, { id: designId, revision: 1, document: first.document })).rejects.toThrow(/another tab/);
    await expect(saveDesign(database, otherWorkspaceId, { id: designId, revision: 2, document: first.document })).rejects.toThrow(/another tab/);
    expect(await getDesign(database, otherWorkspaceId, designId)).toBeNull();
    const loaded = await getDesign(database, workspaceId, designId);
    expect(loaded?.design.title).toBe("A precise launch");
    expect(loaded?.versions.map((version) => version.revision)).toEqual([2, 1]);
    expect(loaded?.versions[1].document.title).toBe("Untitled design");
  });
  it("enforces the active job limit, scopes cancellation, and increments retry attempts", async () => {
    vi.stubEnv("DESIGN_WORKSPACE_CONCURRENCY", "1");
    const input = generationInputSchema.parse({ action: "generate", prompt: "Create a Groq poster", brand: {} });
    const job = await createDesignJob(database, workspaceId, input); jobId = String(job.id);
    await expect(createDesignJob(database, workspaceId, input)).rejects.toThrow(/concurrent/);
    expect(await getDesignJob(database, otherWorkspaceId, jobId)).toBeNull();
    await expect(changeDesignJob(database, otherWorkspaceId, jobId, "cancel")).rejects.toThrow();
    expect((await changeDesignJob(database, workspaceId, jobId, "cancel")).status).toBe("cancelled");
    const retried = await changeDesignJob(database, workspaceId, jobId, "retry");
    expect(retried.status).toBe("queued"); expect(retried.attempt).toBe(2);
    vi.unstubAllEnvs();
  });
  it("retains account deletion guards for new documents and design jobs", async () => {
    await pg.query("insert into public.account_deletion_requests values ($1, now() + interval '1 hour')", [otherWorkspaceId]);
    await expect(saveDesign(database, otherWorkspaceId, { document: emptyDesignDocument() })).rejects.toThrow(/deletion is pending/);
    const input = generationInputSchema.parse({ action: "generate", prompt: "Create a launch poster", brand: {} });
    await expect(createDesignJob(database, otherWorkspaceId, input)).rejects.toThrow(/deletion is pending/);
  });
  it("denies direct unprivileged table access", async () => {
    await pg.exec("create role design_test_reader; set role design_test_reader");
    try { await expect(pg.query("select * from public.design_documents")).rejects.toThrow(/permission denied/); }
    finally { await pg.exec("reset role"); }
  });
  it("blocks workspace deletion with active work and cascades its private designs after cancellation", async () => {
    await expect(pg.query("delete from public.workspaces where id=$1", [workspaceId])).rejects.toThrow(/active design jobs/);
    await changeDesignJob(database, workspaceId, jobId, "cancel");
    await pg.query("delete from public.workspaces where id=$1", [workspaceId]);
    expect((await pg.query("select count(*)::integer as count from public.design_versions where design_id=$1", [designId])).rows[0].count).toBe(0);
    expect(await getDesign(database, workspaceId, designId)).toBeNull();
  });
});
