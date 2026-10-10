import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), database: vi.fn(), getPrivateObject: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ AuthenticationRequiredError: class extends Error {} }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.context }));
vi.mock("@/lib/server/object-storage", () => ({ getPrivateObject: mocks.getPrivateObject }));
vi.mock("@/lib/server/rate-limit", () => ({ getRequestIdentity: () => "test", rateLimit: async () => ({ allowed: true }) }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPrivateObject.mockResolvedValue(new Uint8Array([1]));
});

it.each([true, false, null])("allows Pro Lite to download only watermarked exports (%s)", async (watermarked) => {
  mocks.context.mockResolvedValue({ plan: "pro_lite", workspaceId: "workspace", user: { id: "user" },
    limits: { watermarked: true }, database: mocks.database });
  mocks.database.mockResolvedValue([{ status: "completed", object_key: "export.png", mime_type: "image/png",
    byte_size: 1, file_name: "export.png", download_expires_at: new Date(Date.now() + 60_000), watermarked }]);
  const response = await GET(new Request("https://app.test/api/exports/download"), {
    params: Promise.resolve({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  });
  expect(response.status).toBe(watermarked === true ? 200 : 403);
  expect(mocks.getPrivateObject).toHaveBeenCalledTimes(watermarked === true ? 1 : 0);
});
