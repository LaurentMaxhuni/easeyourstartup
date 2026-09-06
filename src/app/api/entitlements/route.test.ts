import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_LIMITS } from "@/lib/entitlements";

const mocks = vi.hoisted(() => ({
  requireWorkspaceContext: vi.fn(),
  database: vi.fn(),
}));

vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

import { GET } from "@/app/api/entitlements/route";

describe("GET /api/entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.mockResolvedValue([]);
  });

  it("keeps the free workspace on watermarked preview access", async () => {
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "workspace-1",
      plan: "free",
      limits: PLAN_LIMITS.free,
      database: mocks.database,
    });

    const response = await GET();
    const body = (await response.json()) as {
      plan?: string;
      canExportLaunchKit?: boolean;
      limits?: typeof PLAN_LIMITS.free;
      campaignsUsed?: number;
      campaignsReserved?: number;
      campaignsRemaining?: number;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      plan: "free",
      limits: PLAN_LIMITS.free,
      canExportLaunchKit: false,
      campaignsUsed: 0,
      campaignsReserved: 0,
      campaignsRemaining: 1,
    });
  });

  it("unlocks the full launch kit for a Pro workspace", async () => {
    mocks.database.mockResolvedValue([
      { completed_campaigns: 2, reserved_campaigns: 1 },
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "workspace-1",
      plan: "pro",
      limits: PLAN_LIMITS.pro,
      database: mocks.database,
    });

    const response = await GET();
    const body = (await response.json()) as {
      plan?: string;
      canExportLaunchKit?: boolean;
      campaignsUsed?: number;
      campaignsReserved?: number;
      campaignsRemaining?: number;
    };

    expect(body.plan).toBe("pro");
    expect(body.canExportLaunchKit).toBe(true);
    expect(body.campaignsUsed).toBe(2);
    expect(body.campaignsReserved).toBe(1);
    expect(body.campaignsRemaining).toBe(5);
    expect(mocks.database).toHaveBeenCalledTimes(1);
  });
});
