import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt in against the disposable local PostgreSQL server used for this suite.
const postgresBin = process.env.TEST_POSTGRES_BIN;
const databaseName = `migration_test_${randomUUID().replaceAll("-", "")}`;
function psql(database: string, args: string[]) {
  return execFileSync(join(postgresBin!, process.platform === "win32" ? "psql.exe" : "psql"), [
    "-X", "-h", "127.0.0.1", "-p", process.env.TEST_POSTGRES_PORT ?? "55439",
    "-U", process.env.TEST_POSTGRES_USER ?? "audit", "-d", database,
    "-v", "ON_ERROR_STOP=1", "-t", "-A", ...args,
  ], { encoding: "utf8", windowsHide: true, stdio: "pipe" }).trim();
}
const sql = (query: string) => psql(databaseName, ["-c", query]);
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe.skipIf(!postgresBin)("fresh UUID identity migrations", () => {
  beforeAll(() => {
    psql("postgres", ["-c", `create database ${databaseName}`]);
    sql('create schema neon_auth; create table neon_auth."user" (id uuid primary key)');
  });
  afterAll(() => {
    psql("postgres", ["-c", `drop database if exists ${databaseName} with (force)`]);
  });

  it("applies the complete migration chain and provisions a workspace through both identity overloads", () => {
    const files = readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort();
    psql(databaseName, files.flatMap((migration) => ["-f", resolve("migrations", migration)]));
    sql(`insert into neon_auth."user" (id) values ('${userId}')`);
    const workspaceId = sql(`select public.ensure_workspace_for_user('${userId}'::uuid, 'Test')`);
    expect(workspaceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`select public.ensure_workspace_for_user('${userId}'::text, 'Test')`)).toBe(workspaceId);
    expect(sql(`select allowed from public.prepare_account_deletion('${userId}'::text, '${workspaceId}')`)).toBe("t");
  });

  it("repairs legacy text columns without losing memberships or audit history", () => {
    const workspaceId = sql(`select workspace_id from public.memberships where user_id = '${userId}'`);
    sql(`insert into public.audit_events (workspace_id, actor_user_id, event_type) values ('${workspaceId}', '${userId}', 'identity.test')`);
    sql(`
      alter table public.workspaces drop constraint workspaces_owner_user_id_fkey;
      alter table public.workspaces alter column owner_user_id type text using owner_user_id::text;
      alter table public.memberships drop constraint memberships_user_id_fkey;
      alter table public.memberships alter column user_id type text using user_id::text;
      alter table public.audit_events drop constraint audit_events_actor_user_id_fkey;
      alter table public.audit_events alter column actor_user_id type text using actor_user_id::text;
    `);
    psql(databaseName, ["-f", resolve("migrations/0024_uuid_identity_consistency.sql")]);
    expect(sql(`select public.ensure_workspace_for_user('${userId}'::uuid, 'Test')`)).toBe(workspaceId);
    expect(sql("select actor_user_id from public.audit_events where event_type = 'identity.test'")).toBe(userId);
  });

  it("queues exports with a legacy text function argument and UUID requester column", () => {
    const workspaceId = sql(`select workspace_id from public.memberships where user_id = '${userId}'`);
    sql("delete from public.account_deletion_requests");
    const projectId = randomUUID();
    const campaignId = randomUUID();
    sql(`
      insert into public.projects (id, workspace_id, name, active_slot) values ('${projectId}', '${workspaceId}', 'Test', 1);
      insert into public.campaigns (id, workspace_id, project_id, kind, status) values ('${campaignId}', '${workspaceId}', '${projectId}', 'launch', 'completed');
      insert into public.studio_states (user_id, project_id, campaign_id, state) values ('${userId}', '${projectId}', '${campaignId}', '{}');
    `);
    expect(sql(`select allowed from public.enqueue_export_job('${workspaceId}', '${userId}'::text, '${projectId}', '${campaignId}', 1, 'png', 1, '{}'::jsonb, 'test.png', '${randomUUID()}', 'test-export', '${randomUUID()}')`)).toBe("t");
    expect(sql("select requested_by from public.export_requests")).toBe(userId);
  });

  it("rejects deletion of a project with reserved generation and preserves its quota", () => {
    const workspaceId = sql(`select workspace_id from public.memberships where user_id = '${userId}'`);
    const projectId = randomUUID();
    const campaignId = randomUUID();
    sql(`
      insert into public.projects (id, workspace_id, name) values ('${projectId}', '${workspaceId}', 'Reserved');
      insert into public.usage_periods (workspace_id, period_start, period_end, reserved_campaigns) values ('${workspaceId}', '2026-10-01', '2026-11-01', 1);
      insert into public.campaigns (id, workspace_id, project_id, kind, status, usage_reserved, usage_period_start, usage_period_end)
      values ('${campaignId}', '${workspaceId}', '${projectId}', 'launch', 'queued', true, '2026-10-01', '2026-11-01');
      insert into public.jobs (workspace_id, project_id, campaign_id, kind, idempotency_key)
      values ('${workspaceId}', '${projectId}', '${campaignId}', 'generate', 'reserved-deletion');
    `);
    expect(() => sql(`delete from public.projects where id = '${projectId}'`)).toThrow(/Project has active work/);
    expect(sql(`select reserved_campaigns from public.usage_periods where workspace_id = '${workspaceId}'`)).toBe("1");
    expect(sql(`select count(*) from public.campaigns where id = '${campaignId}'`)).toBe("1");
    sql(`update public.jobs set status = 'failed' where campaign_id = '${campaignId}'; select public.release_campaign_usage_reservation('${workspaceId}', '${campaignId}');`);
    sql(`delete from public.projects where id = '${projectId}'`);
    expect(sql(`select reserved_campaigns from public.usage_periods where workspace_id = '${workspaceId}'`)).toBe("0");
  });

  function createAccount() {
    const id = randomUUID();
    sql(`insert into neon_auth."user" values ('${id}')`);
    return { id, workspaceId: sql(`select public.ensure_workspace_for_user('${id}'::uuid, 'Lifecycle')`) };
  }

  it("reuses a URL at the project limit and keeps scan jobs attached to that project", () => {
    const account = createAccount();
    const projectId = sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Product', 'https://Example.com/', 1)`);
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Product', 'https://example.com/#about', 1)`)).toBe(projectId);
    for (let index = 0; index < 2; index++) {
      expect(sql(`select project_id from public.enqueue_scan_job('${account.workspaceId}', null, 'Product', 'https://example.com/', 1, '${randomUUID()}', 'url-scan-${index}', '${randomUUID()}')`)).toBe(projectId);
    }
    expect(sql(`select count(*) from public.projects where workspace_id='${account.workspaceId}'`)).toBe("1");
    expect(sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Other', 'https://example.com/other', 1) is null`)).toBe("t");
    const other = createAccount();
    expect(sql(`select public.get_or_create_scan_project('${other.workspaceId}', '${projectId}', 'Product', 'https://example.com/', 1) is null`)).toBe("t");
  });

  it("reactivates an archived URL without replacing its saved project", () => {
    const account = createAccount();
    const projectId = sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Product', 'https://example.com/', 1)`);
    sql(`update public.projects set status='archived', active_slot=null where id='${projectId}'`);
    expect(sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Product', 'https://example.com/', 1)`)).toBe(projectId);
    expect(sql(`select status from public.projects where id='${projectId}'`)).toBe("active");
    expect(sql(`select public.project_url_key('https://EXAMPLE.com/launch/?v=1#intro')`)).toBe("https://example.com/launch?v=1");
    expect(sql(`select public.project_url_key('https://example.com/a') <> public.project_url_key('https://example.com/A')`)).toBe("t");
  });

  it("serializes simultaneous scans of the same URL into one project", async () => {
    const account = createAccount();
    const run = promisify(execFile);
    const query = `select public.get_or_create_scan_project('${account.workspaceId}', null, 'Product', 'https://concurrent.example/', 1)`;
    const results = await Promise.all([0, 1].map(() => run(
      join(postgresBin!, process.platform === "win32" ? "psql.exe" : "psql"),
      ["-X", "-h", "127.0.0.1", "-p", process.env.TEST_POSTGRES_PORT ?? "55439",
        "-U", process.env.TEST_POSTGRES_USER ?? "audit", "-d", databaseName,
        "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", query],
      { encoding: "utf8", windowsHide: true },
    )));
    expect(results[0].stdout.trim()).toMatch(/^[0-9a-f-]{36}$/);
    expect(results[1].stdout.trim()).toBe(results[0].stdout.trim());
    expect(sql(`select count(*) from public.projects where workspace_id='${account.workspaceId}'`)).toBe("1");
  });

  it("keeps an existing campaign's project when rescanning a legacy duplicate", () => {
    const account = createAccount();
    const original = sql(`select public.get_or_create_scan_project('${account.workspaceId}', null, 'Original', 'https://example.com/', 2)`);
    sql(`insert into public.projects (workspace_id, name, public_url, active_slot) values ('${account.workspaceId}', 'Legacy duplicate', 'https://example.com/', 2)`);
    expect(sql(`select public.get_or_create_scan_project('${account.workspaceId}', '${original}', 'Original', 'https://example.com/', 2)`)).toBe(original);
  });

  it("blocks provider-side user deletion while its workspace has live billing", () => {
    const account = createAccount();
    sql(`insert into public.subscriptions (workspace_id, billing_provider, billing_subscription_id, status) values ('${account.workspaceId}', 'paddle', 'sub_live', 'active')`);
    expect(() => sql(`delete from neon_auth."user" where id = '${account.id}'`)).toThrow(/Account deletion blocked/);
    expect(sql("select billing_subscription_id from public.subscriptions where billing_subscription_id = 'sub_live'")).toBe("sub_live");
    expect(sql(`select count(*) from neon_auth."user" where id = '${account.id}'`)).toBe("1");
    sql(`update public.subscriptions set status = 'canceled' where workspace_id = '${account.workspaceId}'`);
    sql(`delete from neon_auth."user" where id = '${account.id}'`);
    expect(sql(`select count(*) from public.workspaces where id = '${account.workspaceId}'`)).toBe("0");
  });

  it("blocks new jobs and checkout while confirmation is pending and permits them after cancellation", () => {
    const account = createAccount();
    const jobId = randomUUID();
    expect(sql(`select allowed from public.prepare_account_deletion('${account.id}', '${account.workspaceId}')`)).toBe("t");
    const insertJob = `insert into public.jobs (id, workspace_id, kind, idempotency_key) values ('${jobId}', '${account.workspaceId}', 'scan', 'pending-deletion')`;
    expect(() => sql(insertJob)).toThrow(/Account deletion is pending/);
    expect(() => sql(`insert into public.checkout_attempts (workspace_id, billing_price_id, status, expires_at) values ('${account.workspaceId}', 'pri_test', 'creating', now() + interval '10 minutes')`)).toThrow(/Account deletion is pending/);
    sql(`delete from public.account_deletion_requests where user_id = '${account.id}'`);
    sql(insertJob);
    expect(() => sql(`delete from neon_auth."user" where id = '${account.id}'`)).toThrow(/Account deletion blocked/);
    sql(`update public.jobs set status = 'failed' where id = '${jobId}'`);
    sql(`delete from neon_auth."user" where id = '${account.id}'`);
  });

  it("blocks direct provider deletion of either member in a shared workspace", () => {
    const owner = createAccount();
    const memberId = randomUUID();
    sql(`insert into neon_auth."user" values ('${memberId}'); insert into public.memberships (workspace_id, user_id) values ('${owner.workspaceId}', '${memberId}')`);
    expect(() => sql(`delete from neon_auth."user" where id = '${memberId}'`)).toThrow(/Account deletion blocked/);
    expect(() => sql(`delete from neon_auth."user" where id = '${owner.id}'`)).toThrow(/Account deletion blocked/);
    expect(sql(`select count(*) from public.memberships where workspace_id = '${owner.workspaceId}'`)).toBe("2");
  });
});
