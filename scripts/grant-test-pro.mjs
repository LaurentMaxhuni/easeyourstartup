import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";

const repositoryRoot = process.cwd();
for (const file of [".env.local", ".env"]) {
  const path = resolve(repositoryRoot, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const email = process.argv[2]?.trim();
const durationDays = Number(process.argv[3] ?? 7);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: pnpm test:grant-pro -- <account-email> [duration-days]");
  process.exit(1);
}
if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 90) {
  console.error("Test Pro duration must be from 1 to 90 days.");
  process.exit(1);
}
if (process.env.EASEYOURSTARTUP_TEST_MODE?.trim().toLowerCase() !== "true") {
  console.error("Set EASEYOURSTARTUP_TEST_MODE=true before granting test Pro access.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Test Pro grants are disabled in production.");
  process.exit(1);
}

let appUrl;
try {
  appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "");
} catch {
  appUrl = null;
}
if (
  !appUrl ||
  appUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname)
) {
  console.error("Test Pro grants are allowed only for a localhost app URL.");
  process.exit(1);
}

const configuredUrl = process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
if (!configuredUrl) {
  console.error("DATABASE_URL or DATABASE_URL_UNPOOLED is required.");
  process.exit(1);
}

const databaseUrl = new URL(configuredUrl);
if (!process.env.DATABASE_URL_UNPOOLED && databaseUrl.hostname.includes("-pooler.")) {
  databaseUrl.hostname = databaseUrl.hostname.replace("-pooler.", ".");
}
if (databaseUrl.hostname.includes("-pooler.")) {
  console.error("Use a direct, non-pooled Neon database URL for this operator command.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl.toString() });
try {
  const result = await pool.query(
    `
      with target_user as (
        select u.id
        from neon_auth."user" u
        where lower(u.email) = lower($1)
        limit 1
      ), target_workspace as (
        select target_user.id as user_id, m.workspace_id
        from target_user
        join public.memberships m on m.user_id = target_user.id
        order by m.created_at asc
        limit 1
      ), granted as (
        insert into public.test_pro_grants (user_id, workspace_id, expires_at)
        select user_id, workspace_id,
          pg_catalog.now() + ($2::integer * interval '1 day')
        from target_workspace
        on conflict (user_id, workspace_id) do update set
          expires_at = greatest(public.test_pro_grants.expires_at, excluded.expires_at),
          granted_at = pg_catalog.now()
        returning expires_at
      )
      select expires_at from granted
    `,
    [email, durationDays],
  );

  const expiresAt = result.rows[0]?.expires_at;
  if (!expiresAt) {
    console.error("No existing account with an active workspace matched.");
    process.exitCode = 1;
  } else {
    console.log(`Local test Pro access is active until ${new Date(expiresAt).toISOString()}.`);
  }
} catch (error) {
  console.error("Test Pro grant failed.");
  if (error && typeof error === "object" && "message" in error) {
    console.error(String(error.message));
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
