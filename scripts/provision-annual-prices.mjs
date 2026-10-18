import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Catalog-only: this script never creates a transaction or subscription.
const envFile = resolve(process.cwd(), ".env.local");
for (const filename of [envFile, resolve(process.cwd(), ".env")]) {
  if (existsSync(filename)) process.loadEnvFile(filename);
}

const plans = [
  { name: "Pro Lite", monthly: "PADDLE_PRO_LITE_PRICE_ID", annual: "PADDLE_PRO_LITE_ANNUAL_PRICE_ID", monthlyCents: "1399", annualCents: "13430" },
  { name: "Pro", monthly: "PADDLE_PRO_PRICE_ID", annual: "PADDLE_PRO_ANNUAL_PRICE_ID", monthlyCents: "2900", annualCents: "27840" },
  { name: "Founding Pro", monthly: "PADDLE_FOUNDING_PRICE_ID", annual: "PADDLE_FOUNDING_ANNUAL_PRICE_ID", monthlyCents: "1900", annualCents: "18240" },
];

async function main() {
  const environment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase();
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!["sandbox", "production"].includes(environment) || !apiKey) {
    throw new Error("Set PADDLE_ENVIRONMENT and PADDLE_API_KEY before provisioning.");
  }
  for (const plan of plans) {
    if (!/^pri_[a-z\d]{26}$/.test(process.env[plan.monthly]?.trim() ?? "")) {
      throw new Error(`${plan.monthly} must contain an existing monthly catalog price ID.`);
    }
  }
  const baseUrl = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  async function request(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Paddle catalog request failed (HTTP ${response.status}).`);
    const payload = await response.json();
    if (!payload.data) throw new Error("Paddle returned invalid catalog data.");
    return payload;
  }
  function matches(price, productId, amount, interval) {
    return price.product_id === productId && price.status === "active" &&
      price.billing_cycle?.interval === interval && price.billing_cycle.frequency === 1 &&
      price.unit_price?.currency_code === "USD" && price.unit_price.amount === amount &&
      (price.quantity?.minimum ?? 1) <= 1 && (price.quantity?.maximum ?? 1) >= 1 &&
      !price.trial_period && (price.unit_price_overrides?.length ?? 0) === 0;
  }
  for (const plan of plans) {
    const monthlyId = process.env[plan.monthly].trim();
    const monthly = (await request(`/prices/${encodeURIComponent(monthlyId)}`)).data;
    if (!/^pro_[a-z\d]{26}$/.test(monthly.product_id) || !matches(monthly, monthly.product_id, plan.monthlyCents, "month")) {
      throw new Error(`${plan.name}: expected an active USD monthly price without trials or regional overrides.`);
    }
    let annualId = process.env[plan.annual]?.trim();
    if (annualId) {
      const annual = (await request(`/prices/${encodeURIComponent(annualId)}`)).data;
      if (!matches(annual, monthly.product_id, plan.annualCents, "year") || annual.tax_mode !== monthly.tax_mode) {
        throw new Error(`${plan.annual} does not match the expected annual catalog price.`);
      }
      console.log(`${plan.name}: configured annual price verified (${environment}).`);
      continue;
    }
    const contents = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
    if (new RegExp(`^\\s*${plan.annual}\\s*=`, "m").test(contents)) {
      throw new Error(`Remove the empty ${plan.annual} assignment from .env.local, then rerun. Existing assignments are never overwritten.`);
    }
    const existing = await request(`/prices?product_id=${encodeURIComponent(monthly.product_id)}&status=active&per_page=200`);
    if (existing.meta?.pagination?.has_more) throw new Error("Too many catalog prices to safely deduplicate.");
    const annual = existing.data.find((price) => matches(price, monthly.product_id, plan.annualCents, "year") && price.tax_mode === monthly.tax_mode) ??
      (await request("/prices", {
        product_id: monthly.product_id,
        description: `${plan.name} annual, 20% off monthly`,
        name: `${plan.name} — annual`,
        billing_cycle: { interval: "year", frequency: 1 },
        unit_price: { amount: plan.annualCents, currency_code: "USD" },
        tax_mode: monthly.tax_mode,
        quantity: { minimum: 1, maximum: 1 },
      })).data;
    annualId = annual.id;
    if (!/^pri_[a-z\d]{26}$/.test(annualId) || !matches(annual, monthly.product_id, plan.annualCents, "year") || annual.tax_mode !== monthly.tax_mode) {
      throw new Error("Paddle returned an invalid annual catalog price.");
    }
    appendFileSync(envFile, `${contents.endsWith("\n") || !contents ? "" : "\n"}${plan.annual}=${annualId}\n`);
    process.env[plan.annual] = annualId;
    console.log(`${plan.name}: annual price ready; ${plan.annual} appended to .env.local (${environment}).`);
  }
}

main().catch((error) => {
  // Never include request headers, API payloads, or environment values in logs.
  console.error(error instanceof Error ? error.message : "Annual price provisioning failed.");
  process.exitCode = 1;
});
