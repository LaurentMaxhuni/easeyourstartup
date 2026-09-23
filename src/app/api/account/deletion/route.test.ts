import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireWorkspaceContext: vi.fn(),
  database: vi.fn(),
}));

vi.mock("@/lib/server/request-security", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.requireWorkspaceContext }));
vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

import { DELETE, GET, POST } from "@/app/api/account/deletion/route";

const context = {
  user: { id: "user_1" },
  workspaceId: "workspace_1",
  database: mocks.database,
};

describe("account deletion lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceContext.mockResolvedValue(context);
    mocks.database.mockResolvedValue([{ allowed: true, reason: null }]);
  });

  it("prepares deletion only after the database confirms billing and jobs are clear", async () => {
    const response = await POST(new Request("https://example.test/api/account/deletion", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.database.mock.calls[0][0].join("?")).toContain("prepare_account_deletion");
  });

  it("directs active subscribers to billing instead of deleting their account", async () => {
    mocks.database.mockResolvedValue([{ allowed: false, reason: "subscription_must_end" }]);

    const response = await POST(new Request("https://example.test/api/account/deletion", { method: "POST" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ manageUrl: "/settings/billing" });
  });

  it("reports whether an email-confirmed deletion request is still pending", async () => {
    mocks.database.mockResolvedValue([{ expires_at: "2026-09-24T19:00:00.000Z" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pending: true, expiresAt: "2026-09-24T19:00:00.000Z" });
  });

  it("releases the temporary deletion lock when authentication refuses deletion", async () => {
    const response = await DELETE(new Request("https://example.test/api/account/deletion", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(mocks.database.mock.calls[0][0].join("?")).toContain("delete from public.account_deletion_requests");
  });
});
