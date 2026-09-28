import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: vi.fn(),
  rateLimit: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status: 401 | 503;

    constructor(message: string, status: 401 | 503) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("@/lib/server/rate-limit", () => ({
  getRequestIdentity: () => "test-workspace",
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

import { POST } from "./route";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";

const campaignId = "22222222-2222-4222-8222-222222222222";
const existingJob = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "queued",
  progress: 0,
  campaign_id: campaignId,
};

function request() {
  return new Request("http://localhost/api/jobs/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "generation-replay-1",
    },
    body: JSON.stringify({
      projectId: "11111111-1111-4111-8111-111111111111",
      campaign: {
        brand: DEMO_BRAND,
        kind: "launch",
        goal: "Introduce the campaign workflow to solo founders",
        updateDetails: "A new campaign workflow is now available.",
        audience: "Solo SaaS founders",
        launchDate: "",
        cta: "Try the free scan",
        angle: DEMO_ANGLES[0],
        channels: ["x"],
      },
    }),
  });
}

describe("campaign generation idempotency", () => {
  beforeEach(() => {
    vi.stubEnv("INNGEST_EVENT_KEY", "configured");
    mocks.database.mockReset().mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("from public.jobs")) return [existingJob];
      return [];
    });
    mocks.rateLimit.mockReset().mockResolvedValue({ allowed: true });
    mocks.requireWorkspaceContext.mockReset().mockResolvedValue({
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      database: mocks.database,
      limits: { activeProjects: 1, campaignsPerPeriod: 3 },
      usagePeriodStart: "2026-09-01",
      usagePeriodEnd: "2026-10-01",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["archived", { status: "archived", active_slot: 1 }],
    ["outside the current plan limit", { status: "active", active_slot: 2 }],
  ])("returns an existing job when its project is %s", async (_reason, project) => {
    mocks.database.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("from public.jobs")) return [existingJob];
      if (sql.includes("from public.projects")) return [project];
      return [];
    });
    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      job: existingJob,
      campaignId,
    });
    expect(mocks.database).toHaveBeenCalledTimes(1);
    expect(mocks.database.mock.calls[0][0].join(" ")).toContain("idempotency_key");
    expect(mocks.database.mock.calls[0][0].join(" ")).not.toContain("public.projects");
  });
});
