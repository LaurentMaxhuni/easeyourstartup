import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNeonAuth: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: mocks.createNeonAuth,
}));

import { getAuthenticatedUser } from "./server";

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-cookie-secret-that-is-long-enough");
    mocks.getSession.mockReset();
    mocks.createNeonAuth.mockReset();
    mocks.createNeonAuth.mockReturnValue({ getSession: mocks.getSession } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retries repeated transient gateway responses before accepting a session", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: null, error: { status: 502 } } as never)
      .mockResolvedValueOnce({ data: null, error: { status: 502 } } as never)
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      user: { id: "user-1" },
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(3);
  });

  it("retries one transient network error and accepts a recovered session", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: null, error: { code: "NETWORK_ERROR" } } as never)
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      user: { id: "user-1" },
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown fetch network error and accepts a recovered session", async () => {
    mocks.getSession
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      user: { id: "user-1" },
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("retries a thrown gateway error and accepts a recovered session", async () => {
    mocks.getSession
      .mockRejectedValueOnce(Object.assign(new Error("Bad Gateway"), { status: 502 }))
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      user: { id: "user-1" },
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("retries a gateway error reported under the SDK response", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: null, error: { response: { status: 503 } } } as never)
      .mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null } as never);

    await expect(getAuthenticatedUser()).resolves.toEqual({
      user: { id: "user-1" },
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected session", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: null,
      error: { status: 401 },
    } as never);

    await expect(getAuthenticatedUser()).resolves.toMatchObject({
      user: null,
      status: 401,
    });
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });
});
