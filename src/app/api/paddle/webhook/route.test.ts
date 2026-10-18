import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  verifyPaddleWebhookSignature: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/database", () => ({ createDatabase: mocks.createDatabase }));
vi.mock("@/lib/server/paddle", () => ({
  verifyPaddleWebhookSignature: mocks.verifyPaddleWebhookSignature,
}));

import { POST } from "@/app/api/paddle/webhook/route";

function recordingDatabase(responses: unknown[][]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

function webhookRequest(event: Record<string, unknown>) {
  return new Request("https://easeyourstartup.example/api/paddle/webhook", {
    method: "POST",
    headers: { "paddle-signature": "verified" },
    body: JSON.stringify(event),
  });
}

describe("POST /api/paddle/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "sandbox-secret");
    vi.stubEnv("PADDLE_FOUNDING_PRICE_ID", "pri_founding");
    vi.stubEnv("PADDLE_FOUNDING_ANNUAL_PRICE_ID", "pri_founding_annual");
    mocks.verifyPaddleWebhookSignature.mockReturnValue(true);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("records and applies a subscription event in the same database statement", async () => {
    const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const userId = "user_01test";
    const event = {
      event_id: "evt_subscription_1",
      event_type: "subscription.activated",
      occurred_at: "2026-09-23T10:00:00Z",
      data: {
        id: "sub_123",
        customer_id: "ctm_123",
        status: "active",
        custom_data: { neon_user_id: userId, workspace_id: workspaceId },
        current_billing_period: {
          starts_at: "2026-09-23T10:00:00Z",
          ends_at: "2026-10-23T10:00:00Z",
        },
        items: [{ price: { id: "pri_founding" } }],
      },
    };
    const { database, queries } = recordingDatabase([
      [{ workspace_id: workspaceId }],
      [{ id: "receipt_1" }],
    ]);
    mocks.createDatabase.mockReturnValue(database);

    const response = await POST(webhookRequest(event));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: false });
    expect(queries).toHaveLength(2);
    expect(queries[1].sql).toContain("with receipt as");
    expect(queries[1].sql).toContain("insert into public.subscriptions");
    expect(queries[1].sql).toContain("update public.founding_slots");
    expect(queries[1].sql).toContain("last_event_occurred_at <= excluded.last_event_occurred_at");
    expect(queries[1].values).toContain("evt_subscription_1");
    expect(queries[1].values).toContain("pri_founding");
  });

  it("does not reapply a duplicate receipt", async () => {
    const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database, queries } = recordingDatabase([
      [{ workspace_id: workspaceId }],
      [],
    ]);
    mocks.createDatabase.mockReturnValue(database);
    const response = await POST(webhookRequest({
      event_id: "evt_duplicate",
      event_type: "subscription.updated",
      occurred_at: "2026-09-23T10:00:00Z",
      data: {
        id: "sub_123", customer_id: "ctm_123", status: "active",
        custom_data: { neon_user_id: "user_01test", workspace_id: workspaceId },
        items: [{ price: { id: "pri_pro" } }],
      },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(queries).toHaveLength(2);
    expect(queries[1].sql).toContain("on conflict (external_event_id) do nothing");
  });

  it("stores annual billing dates and redeems annual founding subscriptions", async () => {
    const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database, queries } = recordingDatabase([[{ workspace_id: workspaceId }], [{ id: "receipt_annual" }]]);
    mocks.createDatabase.mockReturnValue(database);
    const response = await POST(webhookRequest({
      event_id: "evt_annual", event_type: "subscription.activated", occurred_at: "2028-01-31T10:00:00Z",
      data: { id: "sub_annual", customer_id: "ctm_annual", status: "active",
        custom_data: { neon_user_id: "user_01test", workspace_id: workspaceId },
        current_billing_period: { starts_at: "2028-01-31T10:00:00Z", ends_at: "2029-01-31T10:00:00Z" },
        items: [{ price: { id: "pri_founding_annual", billing_cycle: { interval: "year", frequency: 1 } } }],
      },
    }));
    expect(response.status).toBe(200);
    expect(queries[1].values).toContain("2028-01-31T10:00:00.000Z");
    expect(queries[1].values).toContain("2029-01-31T10:00:00.000Z");
    expect(queries[1].values.filter((value) => value === "pri_founding_annual")).toHaveLength(2);
    expect(queries[1].sql).toContain("subscription.billing_price_id in");
  });
});
