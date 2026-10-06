import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), user: vi.fn(), database: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({
  getNeonAuth: () => ({ handler: () => ({ GET: mocks.get, POST: mocks.post }) }),
  getAuthenticatedUser: mocks.user,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/database", () => ({ createDatabase: () => mocks.database }));
vi.mock("@/lib/server/request-security", () => ({ assertSameOrigin: vi.fn() }));

import { GET, POST } from "./route";

describe("Neon Auth GET proxy", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it("retries transient gateway responses", async () => {
    mocks.get
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await GET(
      new Request("http://localhost/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not retry other GET endpoints", async () => {
    mocks.get.mockResolvedValueOnce(new Response(null, { status: 502 }));

    const response = await GET(
      new Request("http://localhost/api/auth/callback/github"),
      { params: Promise.resolve({ path: ["callback", "github"] }) },
    );

    expect(response.status).toBe(502);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("returns a service-unavailable response after transient gateway failures persist", async () => {
    mocks.get.mockResolvedValue(new Response(null, { status: 502 }));

    const response = await GET(
      new Request("http://localhost/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication is temporarily unavailable. Please try again.",
    });
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });

  it("returns service-unavailable after transient handler failures persist", async () => {
    mocks.get.mockRejectedValue(new TypeError("fetch failed"));

    const response = await GET(
      new Request("http://localhost/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );

    expect(response.status).toBe(503);
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });

  it("does not retry a non-network handler exception", async () => {
    mocks.get.mockRejectedValueOnce(new Error("handler bug"));

    await expect(
      GET(
        new Request("http://localhost/api/auth/get-session"),
        { params: Promise.resolve({ path: ["get-session"] }) },
      ),
    ).rejects.toThrow("handler bug");
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe("account deletion proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.mockReset();
    mocks.user.mockResolvedValue({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } });
    mocks.post.mockResolvedValue(new Response(null, { status: 200 }));
    mocks.get.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("rejects direct deletion without an unexpired preparation request", async () => {
    mocks.database.mockResolvedValue([]);
    const response = await POST(new Request("https://app.example.test/api/auth/delete-user", { method: "POST" }), { params: Promise.resolve({ path: ["delete-user"] }) });
    expect(response.status).toBe(409);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("checks confirmation callbacks before forwarding", async () => {
    mocks.database.mockResolvedValue([]);
    const response = await GET(new Request("https://app.example.test/api/auth/delete-user/callback?token=test"), { params: Promise.resolve({ path: ["delete-user", "callback"] }) });
    expect(response.status).toBe(409);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("rechecks lifecycle constraints for a prepared deletion", async () => {
    mocks.database.mockResolvedValueOnce([{ workspace_id: "workspace" }]).mockResolvedValueOnce([{ allowed: false, reason: "subscription_must_end" }]);
    const response = await POST(new Request("https://app.example.test/api/auth/delete-user", { method: "POST" }), { params: Promise.resolve({ path: ["delete-user"] }) });
    expect(response.status).toBe(409);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("forwards an authenticated prepared deletion only after lifecycle verification", async () => {
    mocks.database.mockResolvedValueOnce([{ workspace_id: "workspace" }]).mockResolvedValueOnce([{ allowed: true }]);
    const response = await POST(new Request("https://app.example.test/api/auth/delete-user", { method: "POST" }), { params: Promise.resolve({ path: ["delete-user"] }) });
    expect(response.status).toBe(200);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(mocks.database).toHaveBeenCalledTimes(2);
  });

  it("rejects deletion when the session cannot be verified", async () => {
    mocks.user.mockResolvedValue({ user: null, status: 401, error: "Sign in required." });
    const response = await POST(new Request("https://app.example.test/api/auth/delete-user", { method: "POST" }), { params: Promise.resolve({ path: ["delete-user"] }) });
    expect(response.status).toBe(401);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
