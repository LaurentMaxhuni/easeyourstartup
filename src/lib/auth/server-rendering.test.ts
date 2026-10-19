import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setCookie: vi.fn(() => {
    throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
  }),
}));

vi.mock("server-only", () => ({}));
// Keep the real SDK session/cache behavior; replace only its Next.js adapter.
vi.mock("@neondatabase/auth/next/server", async () => {
  const { createAuthServer } = await import("@neondatabase/auth/server");
  return {
    createNeonAuth: (config: { baseUrl: string; cookies: { secret: string } }) => createAuthServer({
      baseUrl: config.baseUrl,
      cookieSecret: config.cookies.secret,
      context: async () => ({
        getCookies: () => "__Secure-neon-auth.session_token=test-session",
        setCookie: mocks.setCookie,
        getHeader: () => null,
        getOrigin: () => "http://localhost:3000",
        getFramework: () => "nextjs",
      }),
    }),
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "__Secure-neon-auth.session_token=test-session" }),
  cookies: async () => ({ set: mocks.setCookie }),
}));

describe("session reads during page rendering", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "test-cookie-secret-that-is-long-enough");
    mocks.setCookie.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads a refreshed session without trying to mutate response cookies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { session: { id: "session-1" }, user: { id: "user-1" } },
      { headers: { "set-cookie": "__Secure-neon-auth.session_token=refreshed; Path=/; HttpOnly; Secure" } },
    )));
    const { getCurrentUser } = await import("./server");

    await expect(getCurrentUser()).resolves.toEqual({ id: "user-1" });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("treats rejected sessions as signed out when the provider clears a cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { message: "Session expired" },
      { status: 401, headers: { "set-cookie": "__Secure-neon-auth.session_token=; Max-Age=0; Path=/; HttpOnly; Secure" } },
    )));
    const { getAuthenticatedUser } = await import("./server");

    await expect(getAuthenticatedUser()).resolves.toMatchObject({ user: null, status: 401 });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
