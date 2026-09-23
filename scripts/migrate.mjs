import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
if (!process.env.DATABASE_URL && existsSync(resolve(repositoryRoot, ".env"))) {
  process.loadEnvFile(resolve(repositoryRoot, ".env"));
}
const configuredDatabaseUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
let databaseUrl = configuredDatabaseUrl;
if (databaseUrl && !process.env.DATABASE_URL_UNPOOLED) {
  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.hostname.includes("-pooler.")) {
    parsedUrl.hostname = parsedUrl.hostname.replace("-pooler.", ".");
    databaseUrl = parsedUrl.toString();
  }
}
const migrations = readdirSync(resolve(repositoryRoot, "migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
  .sort();

if (process.argv.includes("--dry-run")) {
  process.stdout.write(`Ordered migrations (${migrations.length}):\n${migrations.join("\n")}\n`);
  process.exit(0);
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required to apply migrations.");
  process.exit(1);
}

const baseline = `
insert into public.app_schema_migrations (migration_name)
select migration_name
from (values
  ('0001_initial_schema.sql', pg_catalog.to_regclass('public.projects') is not null),
  ('0002_studio_states.sql', pg_catalog.to_regclass('public.studio_states') is not null),
  ('0003_campaign_usage_reservations.sql', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'usage_reserved'
  )),
  ('0004_paddle_billing.sql', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subscriptions' and column_name = 'billing_provider'
  )),
  ('0005_project_campaign_editor_state.sql', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'studio_states' and column_name = 'project_id'
  )),
  ('0006_shared_rate_limits.sql', pg_catalog.to_regclass('public.rate_limit_buckets') is not null),
  ('0007_subscription_billing_period_usage.sql', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'usage_period_start'
  )),
  ('0008_founding_offers.sql', pg_catalog.to_regclass('public.founding_slots') is not null),
  ('0009_private_stored_assets.sql', pg_catalog.to_regclass('public.stored_assets') is not null),
  ('0010_channel_regeneration.sql', exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_outputs' and column_name = 'regeneration_reserved'
  )),
  ('0011_private_object_cleanup.sql', pg_catalog.to_regclass('public.object_cleanup_queue') is not null),
  ('0012_atomic_scan_persistence.sql', pg_catalog.to_regprocedure('public.persist_project_scan(uuid,uuid,uuid,jsonb,text,jsonb,jsonb)') is not null),
  ('0013_saved_revision_exports.sql', pg_catalog.to_regclass('public.render_requests') is not null),
  ('0014_transactional_job_outbox.sql', pg_catalog.to_regclass('public.job_outbox') is not null),
  ('0015_checkout_attempt_reuse.sql', pg_catalog.to_regclass('public.checkout_attempts') is not null),
  ('0016_account_deletion_workflow.sql', pg_catalog.to_regclass('public.account_deletion_requests') is not null),
  ('0017_queued_exports.sql', pg_catalog.to_regclass('public.export_requests') is not null),
  ('0018_campaign_job_status_sync.sql', pg_catalog.to_regprocedure('public.sync_campaign_generation_status()') is not null)
) as known_migrations(migration_name, already_present)
where already_present
on conflict (migration_name) do nothing;
`;

const pool = new Pool({ connectionString: databaseUrl });
let transactionOpen = false;
let currentMigration = "migration setup";
let client;

try {
  client = await pool.connect();
  await client.query("begin");
  transactionOpen = true;
  await client.query(
    "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 0))",
    ["easeyourstartup:schema-migrations"],
  );
  await client.query(`
    create table if not exists public.app_schema_migrations (
      migration_name text primary key,
      applied_at timestamptz not null default pg_catalog.now()
    );
  `);
  await client.query(baseline);

  const appliedRows = await client.query(
    "select migration_name from public.app_schema_migrations",
  );
  const applied = new Set(appliedRows.rows.map((row) => row.migration_name));

  for (const migration of migrations) {
    if (applied.has(migration)) {
      process.stdout.write(`Skipping ${migration} (already recorded)\n`);
      continue;
    }

    currentMigration = migration;
    process.stdout.write(`Applying ${migration}\n`);
    const migrationSql = readFileSync(
      resolve(repositoryRoot, "migrations", migration),
      "utf8",
    );
    await client.query(migrationSql);
    await client.query(
      "insert into public.app_schema_migrations (migration_name) values ($1)",
      [migration],
    );
    applied.add(migration);
  }

  await client.query("commit");
  transactionOpen = false;
} catch (error) {
  if (transactionOpen) {
    try {
      await client?.query("rollback");
    } catch {
      // Preserve the migration error if the connection has already closed.
    }
  }
  console.error(`Migration failed during ${currentMigration}.`);
  if (error && typeof error === "object" && "message" in error) {
    console.error(String(error.message));
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
