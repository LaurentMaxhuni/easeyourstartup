import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/inngest/client", () => ({ inngest: { createFunction: (config: unknown, event: unknown, handler: unknown) => ({ config, event, handler }) } }));
vi.mock("@/lib/server/database", () => ({ createDatabase: () => mocks.database, requireDatabase: () => mocks.database }));
vi.mock("@/lib/server/scanner", () => ({ scanWebsite: vi.fn() }));
vi.mock("@/lib/server/object-storage", () => ({ createPrivateObjectReadUrl: vi.fn(), deletePrivateObject: vi.fn(), putPrivateObject: vi.fn() }));
vi.mock("@/lib/server/browserless", () => ({ captureCompositionPng: vi.fn() }));
vi.mock("@/lib/server/campaign-generator", () => ({ generateCampaign: vi.fn(), publicProviderError: vi.fn() }));
vi.mock("@/lib/server/generation-v2", () => ({ generateCampaignV2: vi.fn() }));
vi.mock("@/lib/server/brand-intelligence", () => ({ analyzeBrandIntelligence: vi.fn() }));
import { cleanupDeletedPrivateObjects } from "./functions";

const postgresBin = process.env.TEST_POSTGRES_BIN;
const databaseName = `worker_test_${randomUUID().replaceAll("-", "")}`;
function psql(database: string, query: string) {
  return execFileSync(join(postgresBin!, process.platform === "win32" ? "psql.exe" : "psql"), [
    "-X", "-h", "127.0.0.1", "-p", process.env.TEST_POSTGRES_PORT ?? "55439",
    "-U", process.env.TEST_POSTGRES_USER ?? "audit", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", query,
  ], { encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
}
const sql = (query: string) => psql(databaseName, query);
function boundSql(strings: TemplateStringsArray, values: unknown[]) {
  return strings.reduce((query, part, index) => query + part + (index < values.length
    ? values[index] === null ? "null" : `'${String(values[index]).replaceAll("'", "''")}'`
    : ""), "");
}
type Worker = { handler: (input: { step: { run: (name: string, callback: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown> };

describe.skipIf(!postgresBin)("worker SQL on PostgreSQL", () => {
  beforeAll(() => {
    psql("postgres", `create database ${databaseName}`);
    sql(`
      create table public.export_requests (
        job_id uuid primary key, object_key text, mime_type text, byte_size bigint,
        download_expires_at timestamptz, updated_at timestamptz
      );
      create table public.object_cleanup_queue (object_key text primary key);
    `);
  });
  afterAll(() => psql("postgres", `drop database if exists ${databaseName} with (force)`));
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const rows = sql(boundSql(strings, values));
      return rows ? rows.split("\n").map((id) => ({ id })) : [];
    });
  });

  it("queues the old key and clears an expired export atomically", async () => {
    sql(`insert into public.export_requests values ('${randomUUID()}', 'expired.png', 'image/png', 10, now() - interval '1 day', now())`);
    sql(`insert into public.export_requests values ('${randomUUID()}', 'current.png', 'image/png', 10, now() + interval '1 day', now())`);
    const step = { run: async (name: string, callback: () => Promise<unknown>) =>
      name === "queue-expired-export-files" ? callback() : name === "load-pending-object-cleanup" ? [] : undefined };
    await (cleanupDeletedPrivateObjects as unknown as Worker).handler({ step });
    expect(sql("select object_key from public.object_cleanup_queue")).toBe("expired.png");
    expect(sql("select count(*) from public.export_requests where object_key is null and download_expires_at is null")).toBe("1");
    expect(sql("select object_key from public.export_requests where object_key is not null")).toBe("current.png");
    await (cleanupDeletedPrivateObjects as unknown as Worker).handler({ step });
    expect(sql("select count(*) from public.object_cleanup_queue")).toBe("1");
  });
});
