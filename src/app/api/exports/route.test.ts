import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  getRequestIdentity: vi.fn(),
  rateLimit: vi.fn(),
  requireWorkspaceContext: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  readJsonBody: (request: Request) => request.json(),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.requireWorkspaceContext }));
vi.mock("@/lib/contracts", () => ({ studioStateSchema: { safeParse: mocks.safeParse } }));
vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

import { POST } from "@/app/api/exports/route";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const campaignId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const assetId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const jobId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const designId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const state = {
  projectId,
  campaignId,
  brand: { projectName: "Test App" },
  scan: {},
  generation: {},
  outputs: [{}],
  composition: {
    screenshotUrl: `/api/assets/${assetId}`,
    mockups: { desktop: `/api/assets/${assetId}`, tablet: `/api/assets/${assetId}`, phone: `/api/assets/${assetId}` },
    elements: [],
  },
  design: { id: designId, revision: 2 },
};

function recordingDatabase(responses: unknown[][]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

describe("POST /api/exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INNGEST_EVENT_KEY", "configured");
    mocks.assertSameOrigin.mockImplementation(() => undefined);
    mocks.getRequestIdentity.mockReturnValue("test");
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.safeParse.mockReturnValue({ success: true, data: state });
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId,
      user: { id: "user_1" },
      plan: "pro",
      limits: { activeProjects: 10, watermarked: false },
      database: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["pro", "pro_lite"] as const)("queues a %s export with trusted watermark entitlement", async (plan) => {
    const { database, queries } = recordingDatabase([
      [],
      [{ project_status: "active", active_slot: 1, campaign_status: "completed" }],
      [{ state: {}, revision: 4 }],
      [{ found: 1 }],
      [{ job_id: jobId, status: "queued", progress: 0, created: true, allowed: true }],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId,
      user: { id: "user_1" },
      plan,
      limits: { activeProjects: plan === "pro" ? 10 : 5, watermarked: plan !== "pro" },
      database,
    });

    const response = await POST(new Request("https://app.test/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "export-operation-1" },
      body: JSON.stringify({ format: "zip", projectId, campaignId, expectedRevision: 4 }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ job: { id: jobId, status: "queued" }, created: true });
    expect(queries[3].sql).toContain("design_versions");
    expect(queries[3].values).toEqual([designId, workspaceId, 2]);
    expect(queries[4].sql).toContain("enqueue_export_job");
    const snapshot = queries[4].values.find((value) => typeof value === "string" && value.startsWith("{")) as string;
    expect(JSON.parse(snapshot).watermarked).toBe(plan !== "pro");
    expect(queries[4].values.some((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))).toBe(true);
  });

  it("rejects stale snapshots before adding a durable job", async () => {
    const { database, queries } = recordingDatabase([
      [],
      [{ project_status: "active", active_slot: 1, campaign_status: "completed" }],
      [{ state: {}, revision: 3 }],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId,
      user: { id: "user_1" },
      plan: "pro",
      limits: { activeProjects: 10, watermarked: false },
      database,
    });

    const response = await POST(new Request("https://app.test/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "export-operation-2" },
      body: JSON.stringify({ format: "png", projectId, campaignId, expectedRevision: 4 }),
    }));

    expect(response.status).toBe(409);
    expect(queries.some((query) => query.sql.includes("enqueue_export_job"))).toBe(false);
  });

  it.each([
    ["before the campaign has a saved visual", { ...state, design: null }, []],
    ["when the saved visual revision is missing", state, [[]]],
  ])("refuses to queue an export %s", async (_label, saved, designRows) => {
    mocks.safeParse.mockReturnValue({ success: true, data: saved });
    const { database, queries } = recordingDatabase([
      [], [{ project_status: "active", active_slot: 1, campaign_status: "completed" }],
      [{ state: {}, revision: 4 }], ...designRows,
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({ workspaceId, user: { id: "user_1" }, plan: "pro", limits: { activeProjects: 10, watermarked: false }, database });
    const response = await POST(new Request("https://app.test/api/exports", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "visual-check" },
      body: JSON.stringify({ format: "png", projectId, campaignId, expectedRevision: 4 }),
    }));
    expect(response.status).toBe(409);
    expect(queries.some((query) => query.sql.includes("enqueue_export_job"))).toBe(false);
  });

  it("enforces Pro access even when called directly", async () => {
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId,
      user: { id: "user_1" },
      plan: "free",
      limits: { activeProjects: 1 },
      database: vi.fn(),
    });

    const response = await POST(new Request("https://app.test/api/exports", { method: "POST" }));

    expect(response.status).toBe(403);
  });

  it("returns an already queued export before validating a newer editor revision", async () => {
    const { database, queries } = recordingDatabase([
      [{ id: jobId, kind: "export", status: "rendering", progress: 60 }],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId,
      user: { id: "user_1" },
      plan: "pro",
      limits: { activeProjects: 10, watermarked: false },
      database,
    });

    const response = await POST(new Request("https://app.test/api/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "export-operation-1" },
      body: JSON.stringify({ format: "zip", projectId, campaignId, expectedRevision: 99 }),
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ job: { id: jobId, status: "rendering", progress: 60 }, created: false });
    expect(queries).toHaveLength(1);
  });
});
