import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {
    status = 401;
  },
}));

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  designCreativeComposition: vi.fn(),
  rateLimit: vi.fn(),
  getRequestIdentity: vi.fn(),
  readJsonBody: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/server/campaign-generator", () => ({
  designCreativeComposition: mocks.designCreativeComposition,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  rateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  readJsonBody: mocks.readJsonBody,
}));
vi.mock("@/lib/server/workspace-access", () => ({
  requireWorkspaceContext: mocks.requireWorkspaceContext,
}));

import { POST } from "@/app/api/ai/design/route";

describe("POST /api/ai/design", () => {
  const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const campaignId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestIdentity.mockReturnValue("workspace:test");
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user: { id: "user-1" },
      limits: { activeProjects: 3 },
      database: vi.fn().mockResolvedValue([{ id: projectId }]),
    });
    mocks.readJsonBody.mockResolvedValue({
      projectId,
      campaignId,
      projectName: "EaseYourStartup",
      context: "A source-backed launch campaign studio.",
      approvedFacts: ["The editor is source-backed."],
      composition: DEMO_COMPOSITION,
    });
    mocks.designCreativeComposition.mockRejectedValue(
      new Error("The AI provider could not design this canvas (Provider unavailable)."),
    );
  });

  it("returns a provider error without creating a local canvas", async () => {
    const response = await POST(
      new Request("http://example.test/api/ai/design", { method: "POST" }),
    );
    const body = (await response.json()) as {
      code?: { html?: string; css?: string; javascript?: string };
      mode?: string;
      warning?: string;
      error?: string;
    };

    expect(response.status).toBe(502);
    expect(body.mode).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.error).toMatch(/failed temporarily/i);
  });

  it("returns the provider's validated design and code bundle together", async () => {
    const providerCode = {
      html: '<main data-launch-preview>AI prototype</main>',
      css: "main { color: #f4f3ef; }",
      javascript:
        'const preview = document.querySelector("[data-launch-preview]");',
    };
    mocks.designCreativeComposition.mockResolvedValue({
      design: { ...DEMO_COMPOSITION, elements: [] },
      code: providerCode,
      provider: "openrouter",
    });

    const response = await POST(
      new Request("http://example.test/api/ai/design", { method: "POST" }),
    );
    const body = (await response.json()) as {
      code?: typeof providerCode;
      mode?: string;
      provider?: string;
    };

    expect(response.status).toBe(200);
    expect(body.mode).toBe("ai");
    expect(body.code).toEqual(providerCode);
    expect(body.provider).toBe("openrouter");
  });

  it("rejects requests for projects outside the active workspace scope", async () => {
    mocks.requireWorkspaceContext.mockResolvedValue({
      workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user: { id: "user-1" },
      limits: { activeProjects: 3 },
      database: vi.fn().mockResolvedValue([]),
    });

    const response = await POST(new Request("http://example.test/api/ai/design", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(mocks.designCreativeComposition).not.toHaveBeenCalled();
  });
});
