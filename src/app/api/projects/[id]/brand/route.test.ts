import { beforeEach, expect, it, vi } from "vitest";
import { DEMO_BRAND } from "@/lib/demo-data";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ AuthenticationRequiredError: class extends Error { status = 401; } }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.context }));
vi.mock("@/lib/server/request-security", () => ({
  assertSameOrigin: () => {},
  readJsonBody: async (request: Request) => request.json(),
}));
import { PUT } from "./route";

const projectId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const assetId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const params = { params: Promise.resolve({ id: projectId }) };
const put = (body: unknown) => PUT(new Request(`https://app.example.test/api/projects/${projectId}/brand`, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), params);

let database: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  database = vi.fn(async () => [{ version: 2 }]);
  mocks.context.mockResolvedValue({ database, workspaceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", limits: { activeProjects: 3 } });
});

it("saves edited brand details on the project", async () => {
  const brand = { ...DEMO_BRAND, colors: ["#112233"] };
  const response = await put({ brand });
  expect(response.status).toBe(200);
  const values = database.mock.calls[0].slice(1);
  expect(JSON.parse(values[0] as string).colors).toEqual(["#112233"]);
  expect(values).toContain(projectId);
});

it("saves the stored screenshot only when it belongs to the project", async () => {
  expect((await put({ captureAssetId: assetId })).status).toBe(200);
  const [strings, ...values] = database.mock.calls[0];
  expect((strings as string[]).join("?")).toContain("a.project_id = p.id");
  expect(values.filter((value) => value === assetId)).toHaveLength(3);

  database.mockResolvedValueOnce([]);
  expect((await put({ captureAssetId: assetId })).status).toBe(404);
});

it("rejects empty or malformed updates without writing", async () => {
  expect((await put({})).status).toBe(400);
  expect((await put({ brand: { colors: ["red"] } })).status).toBe(400);
  expect((await put({ captureAssetId: "not-a-uuid" })).status).toBe(400);
  expect(database).not.toHaveBeenCalled();
});
