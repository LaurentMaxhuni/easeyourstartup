import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/provision-annual-prices.mjs");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const pathFromTemp = relative(tmpdir(), directory);
    if (pathFromTemp.startsWith("annual-prices-test-") && !pathFromTemp.includes("..")) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function fixture(existingAnnual = false) {
  const directory = mkdtempSync(join(tmpdir(), "annual-prices-test-"));
  directories.push(directory);
  const env = `PADDLE_ENVIRONMENT=sandbox\nPADDLE_API_KEY=test-only-key\nPADDLE_PRO_LITE_PRICE_ID=pri_${"a".repeat(26)}\nPADDLE_PRO_PRICE_ID=pri_${"b".repeat(26)}\nPADDLE_FOUNDING_PRICE_ID=pri_${"c".repeat(26)}\nUNRELATED_SETTING=keep-me\n`;
  writeFileSync(join(directory, ".env.local"), env);
  // Intercept every fetch in a separate process; no network or actual Paddle writes.
  writeFileSync(join(directory, "mock.mjs"), `
    import { appendFileSync } from "node:fs";
    const monthlyAmounts = {a: "1399", b: "2900", c: "1900"};
    const annualAmounts = {a: "13430", b: "27840", c: "18240"};
    function price(letter, annual) {
      return { id: "pri_" + (annual ? ({a:"d",b:"e",c:"f"})[letter] : letter).repeat(26),
        product_id: "pro_" + letter.repeat(26), status: "active", tax_mode: "account_setting", trial_period: null,
        unit_price_overrides: [], unit_price: {amount: (annual ? annualAmounts : monthlyAmounts)[letter], currency_code: "USD"},
        billing_cycle: {interval: annual ? "year" : "month", frequency: 1} };
    }
    globalThis.fetch = async (url, options) => {
      const parsed = new URL(url);
      if (parsed.origin !== "https://sandbox-api.paddle.com" || !parsed.pathname.startsWith("/prices")) throw new Error("Unexpected endpoint");
      appendFileSync("requests.jsonl", JSON.stringify({method: options.method, path: parsed.pathname, body: options.body ? JSON.parse(options.body) : null}) + "\\n");
      let data;
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        data = price(body.product_id.slice(4, 5), true);
      } else if (parsed.pathname === "/prices") {
        data = ${existingAnnual} ? [price(parsed.searchParams.get("product_id").slice(4, 5), true)] : [];
      } else {
        const letter = parsed.pathname.slice("/prices/pri_".length, "/prices/pri_".length + 1);
        data = price(({d:"a",e:"b",f:"c"})[letter] ?? letter, ["d","e","f"].includes(letter));
      }
      return new Response(JSON.stringify({data, meta: {pagination: {has_more: false}}}), {status: 200});
    };
  `);
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (name.startsWith("PADDLE_")) delete environment[name];
  const run = () => execFileSync(process.execPath, ["--import", pathToFileURL(join(directory, "mock.mjs")).href, script], {
    cwd: directory, env: environment, encoding: "utf8", timeout: 10_000,
  });
  const requests = () => readFileSync(join(directory, "requests.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  return { directory, env, run, requests };
}

describe("annual Paddle catalog provisioning", () => {
  it("creates only annual catalog prices, preserves existing env values, and safely reruns", () => {
    const test = fixture();
    expect(test.run()).not.toContain("test-only-key");
    const contents = readFileSync(join(test.directory, ".env.local"), "utf8");
    expect(contents.startsWith(test.env)).toBe(true);
    expect(contents).toContain(`PADDLE_PRO_LITE_ANNUAL_PRICE_ID=pri_${"d".repeat(26)}`);
    const created = test.requests().filter((request) => request.method === "POST");
    expect(created).toHaveLength(3);
    expect(created.map((request) => request.body.unit_price.amount)).toEqual(["13430", "27840", "18240"]);
    expect(created.every((request) => request.path === "/prices" && request.body.billing_cycle.interval === "year")).toBe(true);
    expect(test.run()).toContain("configured annual price verified");
    expect(readFileSync(join(test.directory, ".env.local"), "utf8")).toBe(contents);
    expect(test.requests().filter((request) => request.method === "POST")).toHaveLength(3);
  });

  it("reuses existing matching annual catalog prices without creating duplicates", () => {
    const test = fixture(true);
    test.run();
    expect(test.requests().every((request) => request.method === "GET")).toBe(true);
    expect(readFileSync(join(test.directory, ".env.local"), "utf8")).toContain("PADDLE_FOUNDING_ANNUAL_PRICE_ID=");
  });
});
