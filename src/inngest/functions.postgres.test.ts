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
vi.mock("@/lib/server/brand-intelligence", () => ({ enrichScannedWebsite: vi.fn() }));
vi.mock("@/lib/job-results", () => ({ serializeGenerateJobResult: JSON.stringify, serializeScanJobResult: JSON.stringify }));
import { cleanupDeletedPrivateObjects, regenerateCampaignChannel } from "./functions";
import { failStaleGenerationJobs } from "@/lib/server/stale-generation-jobs";
import type { DatabaseClient } from "@/lib/server/database";

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
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const campaignId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const job = { jobId, workspaceId, campaignId, channel: "x" };
type Regeneration = {
  config: { onFailure: (input: { event: { data: { event: { data: typeof job } } } }) => Promise<void> };
  handler: (input: { event: { data: typeof job }; step: { run: (name: string, callback: () => unknown) => Promise<unknown> } }) => Promise<unknown>;
};
const regenerate = regenerateCampaignChannel as unknown as Regeneration;
const regenerationStep = { run: async (name: string, callback: () => unknown) => {
  if (name === "load-campaign-brief") return { generatorVersion: "v1", brief: {} };
  if (name === "generate-replacement-channel-copy") return { outputs: [{ channel: "x", headline: "Replacement" }] };
  if (name === "save-regeneration-and-release-reservation") return callback();
} };

describe.skipIf(!postgresBin)("worker SQL on PostgreSQL", () => {
  beforeAll(() => {
    psql("postgres", `create database ${databaseName}`);
    sql(`
      create table public.export_requests (
        job_id uuid primary key, object_key text, mime_type text, byte_size bigint,
        download_expires_at timestamptz, updated_at timestamptz
      );
      create table public.object_cleanup_queue (object_key text primary key);
      create table public.jobs (
        id uuid primary key, workspace_id uuid, campaign_id uuid, kind text, status text,
        progress integer, regeneration_channel text, result jsonb, error_message text, updated_at timestamptz
      );
      create table public.channel_outputs (
        id uuid primary key, workspace_id uuid, campaign_id uuid, channel text, output jsonb,
        regeneration_count integer, regeneration_reserved integer, updated_at timestamptz
      );
      create function public.release_campaign_usage_reservation(uuid, uuid) returns void language sql as 'select';
    `);
  });
  afterAll(() => psql("postgres", `drop database if exists ${databaseName} with (force)`));
  beforeEach(() => {
    vi.clearAllMocks();
    sql("truncate public.jobs, public.channel_outputs");
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

  function seedRegeneration() {
    sql(`
      insert into public.channel_outputs values ('${randomUUID()}', '${workspaceId}', '${campaignId}', 'x', '{}', 0, 2, now());
      insert into public.jobs (id, workspace_id, campaign_id, kind, status, regeneration_channel, updated_at)
      values ('${jobId}', '${workspaceId}', '${campaignId}', 'generate', 'generating', 'x', now() - interval '30 minutes');
    `);
  }

  it("releases only the failed job's reservation once, even when failure callbacks repeat", async () => {
    seedRegeneration();
    const failure = { event: { data: { event: { data: job } } } };
    await regenerate.config.onFailure(failure);
    await regenerate.config.onFailure(failure);
    expect(sql("select status from public.jobs")).toBe("failed");
    expect(sql("select regeneration_reserved from public.channel_outputs")).toBe("1");
  });

  it("commits regeneration and completion once without consuming another job's reservation on replay", async () => {
    seedRegeneration();
    await regenerate.handler({ event: { data: job }, step: regenerationStep });
    await regenerate.handler({ event: { data: job }, step: regenerationStep });
    await regenerate.config.onFailure({ event: { data: { event: { data: job } } } });
    expect(sql("select status from public.jobs")).toBe("completed");
    expect(sql("select regeneration_count || ':' || regeneration_reserved from public.channel_outputs")).toBe("1:1");
    expect(sql("select output->>'headline' from public.channel_outputs")).toBe("Replacement");
  });

  it("recovers a stale regeneration's allowance without releasing another reservation", async () => {
    seedRegeneration();
    const queries: string[] = [];
    const database = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push(boundSql(strings, values));
      return Promise.resolve([{ id: jobId }]);
    }, { transaction: async (items: Promise<unknown[]>[]) => {
      sql(`begin; ${queries.join(";")}; commit;`);
      return Promise.all(items);
    } });
    await failStaleGenerationJobs(database as unknown as DatabaseClient);
    expect(sql("select status from public.jobs")).toBe("failed");
    expect(sql("select regeneration_reserved from public.channel_outputs")).toBe("1");
    queries.length = 0;
    await failStaleGenerationJobs(database as unknown as DatabaseClient);
    expect(sql("select regeneration_reserved from public.channel_outputs")).toBe("1");
  });
});
