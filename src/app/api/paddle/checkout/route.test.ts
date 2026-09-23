import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createDatabase: vi.fn(),
  getCurrentUser: vi.fn(),
  getPaddleConfig: vi.fn(),
  getRequestIdentity: vi.fn(),
  ensureWorkspaceForUser: vi.fn(),
  paddleRequest: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/database", () => ({ createDatabase: mocks.createDatabase }));
vi.mock("@/lib/server/paddle", () => ({
  getPaddleConfig: mocks.getPaddleConfig,
  paddleRequest: mocks.paddleRequest,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/request-security", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/server/workspace-access", () => ({ ensureWorkspaceForUser: mocks.ensureWorkspaceForUser }));

import { POST } from "@/app/api/paddle/checkout/route";

function recordingDatabase(responses: unknown[][]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user = { id: "user_01test", name: "Founder", email: "founder@example.test" };

describe("POST /api/paddle/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PADDLE_PRO_PRICE_ID", "pri_pro");
    vi.stubEnv("PADDLE_FOUNDING_PRICE_ID", "");
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getPaddleConfig.mockReturnValue({ apiKey: "sandbox", environment: "sandbox", baseUrl: "https://sandbox-api.paddle.com" });
    mocks.ensureWorkspaceForUser.mockResolvedValue(workspaceId);
    mocks.getRequestIdentity.mockReturnValue("test-identity");
    mocks.rateLimit.mockResolvedValue({ allowed: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("reuses an existing pending checkout URL instead of creating another transaction", async () => {
    const checkoutUrl = "https://easeyourstartup.example/checkout?_ptxn=txn_123";
    const { database } = recordingDatabase([
      [],
      [],
      [],
      [{
        attempt_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        status: "pending",
        checkout_url: checkoutUrl,
        claimed: false,
      }],
    ]);
    mocks.createDatabase.mockReturnValue(database);

    const response = await POST(new Request("https://easeyourstartup.example/api/paddle/checkout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: checkoutUrl, reused: true });
    expect(mocks.paddleRequest).not.toHaveBeenCalled();
  });

  it("creates and saves one new transaction with its attempt identifier", async () => {
    const checkoutUrl = "https://easeyourstartup.example/checkout?_ptxn=txn_123";
    const { database, queries } = recordingDatabase([
      [],
      [],
      [],
      [{ status: "creating", claimed: true }],
      [{ checkout_url: checkoutUrl }],
    ]);
    mocks.createDatabase.mockReturnValue(database);
    mocks.paddleRequest.mockResolvedValue({ data: { id: "txn_123", checkout: { url: checkoutUrl } } });

    const response = await POST(new Request("https://easeyourstartup.example/api/paddle/checkout", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: checkoutUrl });
    expect(mocks.paddleRequest).toHaveBeenCalledOnce();
    expect(mocks.paddleRequest.mock.calls[0][1].body.custom_data).toMatchObject({
      neon_user_id: user.id,
      workspace_id: workspaceId,
    });
    expect(mocks.paddleRequest.mock.calls[0][1].body.custom_data.checkout_attempt_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(queries[3].sql).toContain("public.checkout_attempts");
    expect(queries[4].sql).toContain("paddle_transaction_id");
  });

  it("blocks a new transaction while account deletion is pending", async () => {
    const { database } = recordingDatabase([[{ user_id: user.id }]]);
    mocks.createDatabase.mockReturnValue(database);

    const response = await POST(new Request("https://easeyourstartup.example/api/paddle/checkout", { method: "POST" }));

    expect(response.status).toBe(409);
    expect(mocks.paddleRequest).not.toHaveBeenCalled();
  });
});
