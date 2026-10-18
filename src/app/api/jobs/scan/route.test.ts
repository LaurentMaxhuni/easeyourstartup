import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  assertSameOrigin: vi.fn(),
  getRequestIdentity: vi.fn(),
  inngestSend: vi.fn(),
  parsePublicHttpUrl: vi.fn(),
  rateLimit: vi.fn(),
  readJsonBody: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after,
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: mocks.inngestSend },
}));

vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  readJsonBody: mocks.readJsonBody,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/server/url-security", () => ({
  parsePublicHttpUrl: mocks.parsePublicHttpUrl,
}));

vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

import { POST } from "@/app/api/jobs/scan/route";

function recordingDatabase(responses: unknown[][]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve(responses.shift() ?? []);
  };
  return { database, queries };
}

describe("POST /api/jobs/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INNGEST_EVENT_KEY", "test-key");
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.parsePublicHttpUrl.mockImplementation((url: string) => new URL(url));
    mocks.inngestSend.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([false, true])("dispatches persisted input immediately and retains recovery on send failure=%s", async (failSend) => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database, queries } = recordingDatabase([
      [{ job_id: "job-1", status: "queued", progress: 0, project_id: projectId, allowed: true }],
      [{ event_id: "event-1", event_payload: { jobId: "job-1", projectId, workspaceId: "workspace-1", url: "https://example.com/" } }],
      [],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({ database, workspaceId: "workspace-1", limits: { activeProjects: 1 } });
    mocks.readJsonBody.mockResolvedValue({ url: "https://example.com/changed", projectName: "Example" });
    if (failSend) mocks.inngestSend.mockRejectedValue(new Error("offline"));
    const response = await POST(new Request("http://example.test/api/jobs/scan", {
      method: "POST", headers: { "Idempotency-Key": "scan-operation" },
    }));
    expect(response.status).toBe(202);
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      id: "event-1", name: "campaign/scan.requested",
      data: { jobId: "job-1", projectId, workspaceId: "workspace-1", url: "https://example.com/" },
    });
    expect(queries.some(({ sql }) => sql.includes("mark_job_outbox_delivered"))).toBe(!failSend);
  });

  it("queues an existing project's rescan through the transactional job function", async () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database, queries } = recordingDatabase([[
      { job_id: "job-1", status: "queued", progress: 0, project_id: projectId, created: true, allowed: true },
    ]]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      limits: { activeProjects: 1 },
    });
    mocks.readJsonBody.mockResolvedValue({
      url: "https://new-source.example/launch",
      projectName: "New source",
      projectId,
    });

    const response = await POST(
      new Request("http://example.test/api/jobs/scan", {
        method: "POST",
        headers: { "Idempotency-Key": "scan-operation" },
      }),
    );

    expect(response.status).toBe(202);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("public.enqueue_scan_job");
    expect(queries[0].values).toEqual(
      expect.arrayContaining([
        "New source",
        "https://new-source.example/launch",
        projectId,
        "workspace-1",
      ]),
    );
  });

  it("creates a project, job, and outbox event atomically for a new scan", async () => {
    const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { database, queries } = recordingDatabase([[
      { job_id: "job-1", status: "queued", progress: 0, project_id: projectId, created: true, allowed: true },
    ]]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      limits: { activeProjects: 1 },
    });
    mocks.readJsonBody.mockResolvedValue({
      url: "https://new-source.example/launch",
      projectName: "New source",
    });

    const response = await POST(
      new Request("http://example.test/api/jobs/scan", {
        method: "POST",
        headers: { "Idempotency-Key": "scan-operation" },
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      job: { id: "job-1", status: "queued", progress: 0 },
      projectId,
    });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("public.enqueue_scan_job");
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });

  it("rejects a new scan when no project slot can be claimed", async () => {
    const { database, queries } = recordingDatabase([[
      { job_id: null, status: null, progress: 0, project_id: null, created: false, allowed: false },
    ]]);
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      limits: { activeProjects: 1 },
    });
    mocks.readJsonBody.mockResolvedValue({
      url: "https://new-source.example/launch",
      projectName: "New source",
    });

    const response = await POST(
      new Request("http://example.test/api/jobs/scan", {
        method: "POST",
        headers: { "Idempotency-Key": "scan-operation" },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Active project limit reached.",
    });
    expect(queries).toHaveLength(1);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
});
