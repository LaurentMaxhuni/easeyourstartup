import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  readJsonBody: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  readJsonBody: mocks.readJsonBody,
}));

vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

import { POST } from "@/app/api/events/route";

function recordingDatabase() {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?"), values });
    return Promise.resolve([]);
  };
  return { database, queries };
}

describe("POST /api/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ allowed: true, remaining: 119 });
  });

  it("records a minimal completed-scan funnel event without customer content", async () => {
    const { database, queries } = recordingDatabase();
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      user: { id: "user-1" },
    });
    mocks.readJsonBody.mockResolvedValue({
      event: "scan_completed",
      properties: { sourcePageCount: 3, mode: "durable" },
    });

    const response = await POST(
      new Request("http://example.test/api/events", { method: "POST" }),
    );

    expect(response.status).toBe(204);
    expect(queries).toHaveLength(1);
    expect(queries[0].values).toContain("studio.scan_completed");
    expect(queries[0].values).toContain(
      JSON.stringify({ sourcePageCount: 3, mode: "durable" }),
    );
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      "studio-events:workspace-1:user-1",
      { limit: 120, windowMs: 60 * 60 * 1000 },
    );
  });

  it("rejects unknown event properties instead of storing arbitrary launch content", async () => {
    const { database, queries } = recordingDatabase();
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      user: { id: "user-1" },
    });
    mocks.readJsonBody.mockResolvedValue({
      event: "scan_completed",
      properties: { scrapedCopy: "private customer data" },
    });

    const response = await POST(
      new Request("http://example.test/api/events", { method: "POST" }),
    );

    expect(response.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it("records a claim-approval milestone without persisting the claim text", async () => {
    const { database, queries } = recordingDatabase();
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      user: { id: "user-1" },
    });
    mocks.readJsonBody.mockResolvedValue({
      event: "claims_approved",
      properties: { approvedClaimCount: 4 },
    });

    const response = await POST(
      new Request("http://example.test/api/events", { method: "POST" }),
    );

    expect(response.status).toBe(204);
    expect(queries[0].values).toContain("studio.claims_approved");
    expect(queries[0].values).toContain(
      JSON.stringify({ approvedClaimCount: 4 }),
    );
  });

  it("drops excess telemetry without adding an audit row", async () => {
    const { database, queries } = recordingDatabase();
    mocks.requireWorkspaceContext.mockResolvedValue({
      database,
      workspaceId: "workspace-1",
      user: { id: "user-1" },
    });
    mocks.rateLimit.mockReturnValue({ allowed: false, remaining: 0 });

    const response = await POST(
      new Request("http://example.test/api/events", { method: "POST" }),
    );

    expect(response.status).toBe(204);
    expect(queries).toHaveLength(0);
    expect(mocks.readJsonBody).not.toHaveBeenCalled();
  });
});
