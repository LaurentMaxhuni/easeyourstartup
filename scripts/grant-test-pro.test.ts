import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";

function runGrant(days: string, overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return spawnSync(process.execPath, [resolve("scripts/grant-test-pro.mjs"), "founder@example.test", days], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      EASEYOURSTARTUP_TEST_MODE: "false",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      ...overrides,
    },
    encoding: "utf8",
    timeout: 10_000,
  });
}

it("allows a two-month duration while still requiring explicit test mode", () => {
  const result = runGrant("62");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Set EASEYOURSTARTUP_TEST_MODE=true");
});

it("rejects durations beyond the temporary grant limit", () => {
  const result = runGrant("91");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("1 to 90 days");
});

it("rejects two-month grants in production", () => {
  const result = runGrant("62", { NODE_ENV: "production", EASEYOURSTARTUP_TEST_MODE: "true" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("disabled in production");
});
