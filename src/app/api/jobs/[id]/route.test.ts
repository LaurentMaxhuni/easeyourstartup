import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

import { GET } from "@/app/api/jobs/[id]/route";

function recordingDatabase(responses: unknown[][]) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const database = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join("?"), values });
      return Promise.resolve(responses.shift() ?? []);
    },
    { transaction: (items: Promise<unknown[]>[]) => Promise.all(items) },
  );
  return { database, queries };
}

describe("GET /api/jobs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails a stale generation and releases its reserved usage", async () => {
    const { database, queries } = recordingDatabase([
      [{ id: "job-1", kind: "generate", status: "generating", progress: 75, result: null, error_message: null, updated_at: "2026-09-20T00:00:00Z", stale_generation: true }],
      [{ id: "job-1" }],
      [],
      [],
      [{ id: "job-1", kind: "generate", status: "failed", progress: 75, result: null, error_message: "Generation stopped after 20 minutes without a result. Try generating this campaign again.", updated_at: "2026-09-20T02:00:00Z", stale_generation: false }],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({ database, workspaceId: "workspace-1" });

    const response = await GET(new Request("http://example.test/api/jobs/job-1"), {
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job: {
        status: "failed",
        error_message: "Generation stopped after 20 minutes without a result. Try generating this campaign again.",
      },
    });
    expect(queries[0].sql).toContain("status in ('queued', 'generating')");
    expect(queries[0].values).toContain("20 minutes");
    expect(queries[2].sql).toContain("release_campaign_usage_reservation");
    expect(queries[2].sql).toContain("updated_at = pg_catalog.now()");
  });

  it("fails a scan whose worker never finished it", async () => {
    const { database, queries } = recordingDatabase([
      [{ id: "job-1", kind: "scan", status: "queued", progress: 0, result: null, error_message: null, updated_at: "2026-10-25T16:15:24Z", stale_generation: false, stale_scan_or_export: true }],
      [{ id: "job-1" }],
      [{ id: "job-1", kind: "scan", status: "failed", progress: 0, result: null, error_message: "The scan stopped without finishing. Scan the website again.", updated_at: "2026-10-25T19:00:00Z", stale_generation: false, stale_scan_or_export: false }],
    ]);
    mocks.requireWorkspaceContext.mockResolvedValue({ database, workspaceId: "workspace-1" });

    const response = await GET(new Request("http://example.test/api/jobs/job-1"), {
      params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });

    const body = await response.json();
    expect(body.job).toMatchObject({ status: "failed", error_message: "The scan stopped without finishing. Scan the website again." });
    expect(body.job).not.toHaveProperty("stale_scan_or_export");
    expect(queries[0].values).toEqual(expect.arrayContaining(["10 minutes", "20 minutes"]));
    expect(queries[1].sql).toContain("kind = 'scan' and status in ('queued', 'scanning', 'analyzing')");
    expect(queries[1].sql).not.toContain("release_campaign_usage_reservation");
  });
});
