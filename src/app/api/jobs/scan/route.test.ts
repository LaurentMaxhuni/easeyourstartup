import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  getRequestIdentity: vi.fn(),
  inngestSend: vi.fn(),
  parsePublicHttpUrl: vi.fn(),
  rateLimit: vi.fn(),
  readJsonBody: vi.fn(),
  requireWorkspaceContext: vi.fn(),
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

  it("updates the saved project source when an existing project is rescanned", async () => {
    const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database, queries } = recordingDatabase([
      [{ id: projectId }],
      [{ id: "job-1", status: "queued", progress: 0 }],
    ]);
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
      new Request("http://example.test/api/jobs/scan", { method: "POST" }),
    );

    expect(response.status).toBe(202);
    const update = queries.find((query) =>
      query.sql.includes("update public.projects"),
    );
    expect(update?.values).toEqual(
      expect.arrayContaining([
        "New source",
        "https://new-source.example/launch",
        projectId,
        "workspace-1",
      ]),
    );
  });

  it("atomically claims an available project slot before queueing a new scan", async () => {
    const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const job = { id: "job-1", status: "queued", progress: 0 };
    const { database, queries } = recordingDatabase([[{ id: projectId }], [job]]);
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
      new Request("http://example.test/api/jobs/scan", { method: "POST" }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ job, projectId });
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain("generate_series");
    expect(queries[0].sql).toContain("on conflict (workspace_id, active_slot)");
  });

  it("rejects a new scan when no project slot can be claimed", async () => {
    const { database, queries } = recordingDatabase([[]]);
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
      new Request("http://example.test/api/jobs/scan", { method: "POST" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Active project limit reached.",
    });
    expect(queries).toHaveLength(1);
    expect(mocks.inngestSend).not.toHaveBeenCalled();
  });
});
