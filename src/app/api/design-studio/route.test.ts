import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDesignDocument } from "@/lib/design-studio/document";
import { AuthenticationRequiredError } from "@/lib/auth/server";

vi.mock("server-only", () => ({}));
// The SDK's ESM entry imports extensionless next/headers outside Next's loader.
// Keep our real AuthenticationRequiredError and HTTP mapping; stub only the SDK.
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: vi.fn() }));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rateLimit: vi.fn(), after: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.workspace }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/server/design-studio/providers", () => ({
  hasDesignProviders: () => true,
  getDesignProviderSettings: () => ({ providers: [], available: true }),
}));
vi.mock("@/lib/server/design-studio/jobs", () => ({ dispatchDesignJob: mocks.dispatch }));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));

import { GET, POST } from "./route";
import { GET as GET_JOB } from "./jobs/[id]/route";
import { POST as EXPORT } from "./export/route";
import { POST as UPLOAD } from "./assets/route";

const origin = "https://app.test";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const foreignWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const designId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
let database: ReturnType<typeof vi.fn>;
let queries: Array<{ sql: string; values: unknown[] }>;
let rows: Record<string, unknown>[][];
function request(body: unknown, path = "/api/design-studio") {
  return new Request(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
}
function row(revision = 1) {
  return { id: designId, title: "Untitled design", document: emptyDesignDocument(), revision, updated_at: "2026-10-25T00:00:00.000Z" };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  vi.stubEnv("INNGEST_EVENT_KEY", "local-test-key");
  rows = [];
  queries = [];
  database = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queries.push({ sql: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return rows.shift() ?? [];
  });
  mocks.workspace.mockResolvedValue({ database, workspaceId, user: { id: "user-1" } });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.dispatch.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("design API authorization and workspace boundaries", () => {
  it.each(["list", "design", "job"])("rejects unauthenticated %s reads without querying storage", async (kind) => {
    mocks.workspace.mockRejectedValue(new AuthenticationRequiredError("Sign in to continue.", 401));
    const response = kind === "job"
      ? await GET_JOB(new Request(`${origin}/api/design-studio/jobs/${jobId}`), { params: Promise.resolve({ id: jobId }) })
      : await GET(new Request(`${origin}/api/design-studio${kind === "design" ? `?designId=${designId}` : ""}`));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to continue." });
    expect(database).not.toHaveBeenCalled();
  });

  it.each(["save", "brand", "generate", "edit", "cancel", "retry", "export", "upload"])("rejects unauthenticated %s writes before storage, dispatch or rendering", async (action) => {
    mocks.workspace.mockRejectedValue(new AuthenticationRequiredError("Sign in to continue.", 401));
    const response = action === "export" ? await EXPORT(request({ format: "json", document: emptyDesignDocument(), pageId: "page-1" }))
      : action === "upload" ? await UPLOAD(request({})) : await POST(request({ action }));
    expect(response.status).toBe(401);
    expect(database).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each(["design", "job"])("returns 404 for a foreign or absent %s without leaking data", async (kind) => {
    const response = kind === "design" ? await GET(new Request(`${origin}/api/design-studio?designId=${designId}`))
      : await GET_JOB(new Request(`${origin}/api/design-studio/jobs/${jobId}`), { params: Promise.resolve({ id: jobId }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/not found/i) });
    expect(queries).toHaveLength(1);
    expect(queries[0].values).toEqual([kind === "design" ? designId : jobId, workspaceId]);
    expect(queries[0].sql).toMatch(/where id = \?::uuid and workspace_id = \?::uuid/);
  });

  it("uses authenticated workspace ownership instead of a submitted workspace ID", async () => {
    rows.push([row()]);
    const response = await POST(request({ action: "save", workspaceId: foreignWorkspaceId, document: emptyDesignDocument() }));
    expect(response.status).toBe(200);
    expect((await response.json()).design.revision).toBe(1);
    expect(queries).toHaveLength(1);
    expect(queries[0].values).toContain(workspaceId);
    expect(queries[0].values).not.toContain(foreignWorkspaceId);
  });

  it("returns a guarded revision conflict and performs no follow-up writes", async () => {
    const doc = emptyDesignDocument();
    const before = structuredClone(doc);
    const response = await POST(request({ action: "save", id: designId, revision: 2, document: doc }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/another tab/i) });
    expect(queries).toHaveLength(1);
    expect(queries[0].values.slice(-3)).toEqual([designId, workspaceId, 2]);
    expect(doc).toEqual(before);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("requires an expected revision before querying an existing design update", async () => {
    const response = await POST(request({ action: "save", id: designId, document: emptyDesignDocument() }));
    expect(response.status).toBe(400);
    expect(database).not.toHaveBeenCalled();
  });

  it.each(["cancel", "retry"])("returns 404 for %s of a foreign job and never dispatches it", async (action) => {
    const response = await POST(request({ action, jobId }));
    expect(response.status).toBe(404);
    expect(queries).toHaveLength(1);
    expect(queries[0].values).toEqual([jobId, workspaceId]);
    expect(queries[0].sql).toMatch(/select[\s\S]*where id = \?::uuid and workspace_id = \?::uuid/);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("cancels an active owned job using a scoped state transition", async () => {
    rows.push([{ id: jobId, status: "running", attempt: 1 }], [{ id: jobId, status: "cancelled", attempt: 1 }]);
    const response = await POST(request({ action: "cancel", jobId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ job: { id: jobId, status: "cancelled" } });
    expect(queries[1].values).toEqual([jobId, workspaceId]);
    expect(queries[1].sql).toMatch(/status in \('queued','running'\)/);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("retries an owned failed job through the workspace concurrency function", async () => {
    rows.push([{ id: jobId, status: "failed", attempt: 1 }], [{ id: jobId, status: "queued", attempt: 2 }]);
    const response = await POST(request({ action: "retry", jobId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ job: { attempt: 2, status: "queued" } });
    expect(queries[1].sql).toMatch(/public\.retry_design_job\(/);
    expect(queries[1].values.slice(0, 2)).toEqual([workspaceId, jobId]);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).toHaveBeenCalledWith(jobId, workspaceId, 2);
  });

  it("rejects cancellation when an owned job has already completed", async () => {
    rows.push([{ id: jobId, status: "completed", attempt: 1 }], []);
    const response = await POST(request({ action: "cancel", jobId }));
    expect(response.status).toBe(409);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(["save", "brand", "generate", "edit"])("rejects forged raster bytes in %s before persistence", async (action) => {
    const asset = { id: "unsafe", name: "Unsafe", kind: "image", description: "", dataUrl: `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64")}` };
    const document = emptyDesignDocument();
    document.assets = [asset as typeof document.assets[number]];
    const response = await POST(request({ action, document, kit: {}, brand: {}, assets: [asset], prompt: "Build a release poster" }));
    expect(response.status).toBe(400);
    expect(database).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects non-raster content mislabeled as a PNG upload", async () => {
    const form = new FormData();
    form.set("file", new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], "forged.png", { type: "image/png" }));
    const response = await UPLOAD(new Request(`${origin}/api/design-studio/assets`, { method: "POST", headers: { Origin: origin }, body: form }));
    expect(response.status).toBe(415);
    expect(database).not.toHaveBeenCalled();
  });

  it("rejects invalid layer styles before a database write", async () => {
    const document = emptyDesignDocument();
    document.pages[0].nodes[0].fill = "url(https://example.com/private)";
    const response = await POST(request({ action: "save", document }));
    expect(response.status).toBe(400);
    expect(database).not.toHaveBeenCalled();
  });

  it("blocks cross-origin writes before resolving a workspace", async () => {
    const response = await POST(new Request(`${origin}/api/design-studio`, { method: "POST", headers: { Origin: "https://attacker.test", "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", document: emptyDesignDocument() }) }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
  });
});
