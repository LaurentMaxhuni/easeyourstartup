import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/server/database", () => ({ createDatabase: mocks.createDatabase }));

import { requireWorkspaceContext } from "@/lib/server/workspace-access";

function databaseWith(
  subscription: Record<string, unknown> | null,
  testGrant?: Record<string, unknown> | null,
) {
  const responses: unknown[][] = [
    [{ workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    subscription ? [subscription] : [],
    ...(testGrant === undefined ? [] : testGrant ? [[testGrant]] : [[]]),
  ];
  const queries: string[] = [];
  const database = (strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

describe("workspace billing entitlements", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  beforeEach(() => {
    vi.stubEnv("PADDLE_PRO_PRICE_ID", "pri_pro");
    vi.stubEnv("PADDLE_PRO_LITE_PRICE_ID", "pri_lite");
    vi.stubEnv("PADDLE_FOUNDING_PRICE_ID", "pri_founding");
    vi.stubEnv("PADDLE_PRO_ANNUAL_PRICE_ID", "pri_pro_annual");
    vi.stubEnv("PADDLE_PRO_LITE_ANNUAL_PRICE_ID", "pri_lite_annual");
    vi.stubEnv("PADDLE_FOUNDING_ANNUAL_PRICE_ID", "pri_founding_annual");
    mocks.requireCurrentUser.mockResolvedValue({ id: "user_01test", name: "Founder", email: "founder@example.test" });
  });

  it("grants Pro for a configured regular price", async () => {
    const { database } = databaseWith({
      status: "active", billing_price_id: "pri_pro", founding_offer_eligible: false,
    });
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "pro" });
  });

  it("grants Pro Lite with subscription billing periods", async () => {
    const { database } = databaseWith({ status: "active", billing_price_id: "pri_lite",
      current_period_start: "2026-10-05T00:00:00Z", current_period_end: "2026-11-05T00:00:00Z" });
    mocks.createDatabase.mockReturnValue(database);
    await expect(requireWorkspaceContext()).resolves.toMatchObject({
      plan: "pro_lite", limits: { activeProjects: 5, watermarked: true },
      usagePeriodStart: "2026-10-05", usagePeriodEnd: "2026-11-05",
    });
  });

  it("denies Pro Lite for an inactive subscription", async () => {
    const { database } = databaseWith({ status: "canceled", billing_price_id: "pri_lite" });
    mocks.createDatabase.mockReturnValue(database);
    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "free" });
  });

  it.each([
    ["pri_lite_annual", false, "pro_lite"],
    ["pri_pro_annual", false, "pro"],
    ["pri_founding_annual", true, "pro"],
  ])("grants monthly campaign allowances for annual price %s", async (price, founding, plan) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-02-29T23:59:59Z"));
    const { database } = databaseWith({ status: "active", billing_price_id: price,
      founding_offer_eligible: founding,
      current_period_start: "2028-01-31T00:00:00Z", current_period_end: "2029-01-31T00:00:00Z" });
    mocks.createDatabase.mockReturnValue(database);
    await expect(requireWorkspaceContext()).resolves.toMatchObject({
      plan, limits: { campaignsPerPeriod: 8 },
      usagePeriodStart: "2028-02-01", usagePeriodEnd: "2028-03-01",
    });
    vi.setSystemTime(new Date("2028-03-01T00:00:00Z"));
    mocks.createDatabase.mockReturnValue(databaseWith({ status: "active", billing_price_id: price,
      founding_offer_eligible: founding,
      current_period_start: "2028-01-31T00:00:00Z", current_period_end: "2029-01-31T00:00:00Z" }).database);
    await expect(requireWorkspaceContext()).resolves.toMatchObject({
      usagePeriodStart: "2028-03-01", usagePeriodEnd: "2028-04-01",
    });
  });

  it("denies annual founding access without a workspace slot", async () => {
    mocks.createDatabase.mockReturnValue(databaseWith({ status: "active",
      billing_price_id: "pri_founding_annual", founding_offer_eligible: false }).database);
    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "free" });
  });

  it("does not grant the founding price to an unallocated workspace", async () => {
    const { database, queries } = databaseWith({
      status: "active", billing_price_id: "pri_founding", founding_offer_eligible: false,
    });
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "free" });
    expect(queries[1]).toContain("public.founding_slots");
  });

  it("grants the founding price only when the workspace owns a slot", async () => {
    const { database } = databaseWith({
      status: "active", billing_price_id: "pri_founding", founding_offer_eligible: true,
    });
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "pro" });
  });

  it("grants temporary Pro only in explicit localhost test mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EASEYOURSTARTUP_TEST_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const expiresAt = new Date("2026-09-30T12:00:00.000Z");
    const { database, queries } = databaseWith(null, { expires_at: expiresAt });
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({
      plan: "pro",
      testProExpiresAt: expiresAt,
    });
    expect(queries[2]).toContain("public.test_pro_grants");
  });

  it("ignores local test grants in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EASEYOURSTARTUP_TEST_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const { database, queries } = databaseWith(null);
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "free" });
    expect(queries).toHaveLength(2);
  });

  it("ignores test grants for a non-local app URL", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EASEYOURSTARTUP_TEST_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://easeyourstartup.example");
    const { database, queries } = databaseWith(null);
    mocks.createDatabase.mockReturnValue(database);

    await expect(requireWorkspaceContext()).resolves.toMatchObject({ plan: "free" });
    expect(queries).toHaveLength(2);
  });
});
