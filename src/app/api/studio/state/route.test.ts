import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createDatabase: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  loadStudioState: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/lib/server/database", () => ({ createDatabase: mocks.createDatabase }));
vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  readJsonBody: (request: Request) => request.json(),
}));
vi.mock("@/lib/server/studio-state", () => ({
  getStudioStorageKey: () => "studio-key",
  loadStudioState: mocks.loadStudioState,
  saveStudioState: vi.fn(),
  StudioStateConflictError: class StudioStateConflictError extends Error {},
}));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.requireWorkspaceContext }));

import { GET } from "@/app/api/studio/state/route";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const campaignId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const jobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function editorState() {
  return {
    step: "campaign",
    projectId,
    campaignId: null,
    jobId: null,
    jobType: null,
    scan: null,
    brand: null,
    draft: {
      kind: "launch",
      goal: "Announce the release",
      updateDetails: "The product is ready to use.",
      audience: "Independent founders",
      launchDate: "",
      cta: "Try it",
      angle: { id: "customer-outcome", title: "Customer outcome", summary: "Lead with a clear user benefit." },
      channels: ["x"],
    },
    generation: null,
    selectedCreativeId: "",
    outputs: [],
    composition: DEMO_COMPOSITION,
  };
}

function recordingDatabase(responses: unknown[][]) {
  return vi.fn().mockImplementation(() => Promise.resolve(responses.shift() ?? []));
}

describe("GET /api/studio/state job recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const database = recordingDatabase([
      [{ id: projectId, status: "active", active_slot: 1 }],
      [{ id: jobId, kind: "scan", project_id: projectId, campaign_id: null, regeneration_channel: null }],
    ]);
    mocks.assertSameOrigin.mockImplementation(() => undefined);
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: "user-1" } });
    mocks.createDatabase.mockReturnValue(database);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      user: { id: "user-1" },
      database,
    });
    mocks.loadStudioState.mockResolvedValue(null);
  });

  it("returns an active scan reference even before an editor snapshot exists", async () => {
    const response = await GET(new Request(`https://app.test/api/studio/state?projectId=${projectId}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: null,
      activeJob: { id: jobId, kind: "scan", projectId, campaignId: null },
    });
  });

  it("reattaches an active generation to its new campaign when the URL has no campaign id yet", async () => {
    const database = recordingDatabase([
      [{ id: projectId, status: "active", active_slot: 1 }],
      [{ id: jobId, kind: "generate", project_id: projectId, campaign_id: campaignId, regeneration_channel: null }],
    ]);
    mocks.createDatabase.mockReturnValue(database);
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      user: { id: "user-1" },
      database,
    });
    mocks.loadStudioState.mockResolvedValue({ state: editorState(), revision: 2 });

    const response = await GET(new Request(`https://app.test/api/studio/state?projectId=${projectId}`));
    const body = await response.json() as { state?: { campaignId?: string; jobId?: string; jobType?: string } };

    expect(response.status).toBe(200);
    expect(body.state).toMatchObject({ campaignId, jobId, jobType: "generate" });
  });
});
