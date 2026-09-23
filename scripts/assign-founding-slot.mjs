import { neon } from "@neondatabase/serverless";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const usage = "Usage: pnpm founding:assign <workspace-uuid>";
const workspaceId = process.argv[2]?.trim();
if (!workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) {
  console.error(usage);
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "..");
  if (existsSync(resolve(repositoryRoot, ".env"))) process.loadEnvFile(resolve(repositoryRoot, ".env"));
}
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required to assign a founding slot.");
  process.exit(1);
}

try {
  const database = neon(databaseUrl);
  const [result] = await database`
    select public.assign_founding_slot(${workspaceId}::uuid) as slot
  `;
  if (result?.slot === null || result?.slot === undefined) {
    console.error("All ten founding slots are assigned.");
    process.exit(1);
  }
  console.log(`Workspace ${workspaceId} has founding slot ${result.slot}.`);
} catch {
  console.error("The founding slot could not be assigned. Check the workspace ID and operator database access.");
  process.exit(1);
}
