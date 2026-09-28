import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({
  getNeonAuth: () => ({ handler: () => ({ GET: mocks.get }) }),
}));

import { GET } from "./route";

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
