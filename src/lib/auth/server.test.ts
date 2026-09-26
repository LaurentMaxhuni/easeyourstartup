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

  it("retries one transient upstream 502 and accepts a recovered session", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: null, error: { status: 502 } } as never)
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
