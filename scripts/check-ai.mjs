// Checks every configured AI provider and model with real requests.
// Exits non-zero when any AI step has no working provider.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const reportPath = resolve(process.cwd(), "output", "ai-check.json");
rmSync(reportPath, { force: true });

const run = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", "--mode", "ai-check", "src/lib/server/ai-health.live.test.ts"],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" },
);
if (!existsSync(reportPath)) {
  console.error("The AI check did not produce a report.");
  process.exit(run.status || 1);
}

const { checks, errors, warnings } = JSON.parse(readFileSync(reportPath, "utf8"));
const rows = checks.map((check) => ({
  task: check.task,
  order: check.position + 1,
  provider: check.provider,
  model: check.model,
  listed: check.modelListed === null ? "?" : check.modelListed ? "yes" : "NO",
  result: check.ok ? `ok ${check.latencyMs}ms` : `FAILED ${check.error ?? ""}`.slice(0, 90),
}));
console.table(rows);
for (const warning of warnings) console.warn(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);
if (errors.length === 0) console.log(warnings.length ? "AI providers work, with warnings above." : "All AI providers work.");
process.exit(errors.length ? 1 : 0);
