import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  designCreativeComposition: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  rateLimit: vi.fn(),
  getRequestIdentity: vi.fn(),
  readJsonBody: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
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

import { POST } from "@/app/api/ai/design/route";

describe("POST /api/ai/design", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getRequestIdentity.mockReturnValue("test-request");
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.readJsonBody.mockResolvedValue({
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
    expect(body.error).toMatch(/provider unavailable/i);
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
});
