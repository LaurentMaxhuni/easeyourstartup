import sharp from "sharp";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), put: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ AuthenticationRequiredError: class extends Error { status = 401; } }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.context }));
vi.mock("@/lib/server/object-storage", () => ({ putPrivateObject: mocks.put, deletePrivateObject: mocks.remove }));
vi.mock("@/lib/server/rate-limit", () => ({ getRequestIdentity: () => "test", rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: () => {},
  readBoundedBody: async (request: Request) => new Uint8Array(await request.arrayBuffer()),
}));
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

it("persists a processed upload with a UUID owner", async () => {
  const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let saved = false;
  const database = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    if (!query.includes("insert into public.stored_assets")) return [{ id: projectId }];
    // PostgreSQL does not assign an explicitly typed text expression to a UUID column.
    const ownerExpression = strings[3];
    if (!ownerExpression.startsWith("::uuid")) throw new Error("owner_user_id is uuid but expression is text");
    expect(values[2]).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    saved = true;
    return [];
  });
  mocks.context.mockResolvedValue({
    database, user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", limits: { activeProjects: 1 },
  });
  mocks.put.mockResolvedValue({ byteSize: 100, sha256: "test" });
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("file", new File([new Uint8Array(image)], "test.png", { type: "image/png" }));
  const response = await POST(new Request("https://app.example.test/api/uploads", { method: "POST", body: form }));
  expect(response.status).toBe(200);
  expect(saved).toBe(true);
  expect(mocks.remove).not.toHaveBeenCalled();
});
