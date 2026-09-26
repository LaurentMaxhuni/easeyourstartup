import "server-only";

import {
  createNeonAuth,
  type NeonAuth,
} from "@neondatabase/auth/next/server";

let cachedAuth: NeonAuth | null | undefined;
const AUTH_RETRY_DELAY_MS = 250;
const RETRYABLE_AUTH_STATUSES = new Set([502, 503, 504]);

export function getNeonAuth(): NeonAuth | null {
  if (cachedAuth !== undefined) return cachedAuth;

  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) {
    cachedAuth = null;
    return cachedAuth;
  }

  cachedAuth = createNeonAuth({
    baseUrl,
    cookies: { secret: cookieSecret },
  });
  return cachedAuth;
}

async function getSessionWithTransientRetry(auth: NeonAuth) {
  const result = await auth.getSession();
  const status = result.error && "status" in result.error
    ? Number(result.error.status)
    : 0;
  if (!result.error || !RETRYABLE_AUTH_STATUSES.has(status)) return result;

  await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
  return auth.getSession();
}

export async function getCurrentSession() {
  const auth = getNeonAuth();
  if (!auth) return null;

  const { data, error } = await getSessionWithTransientRetry(auth);
  if (error) return null;
  return data;
}

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type AuthenticationCheck =
  | { user: CurrentUser }
  | { user: null; error: string; status: 401 | 503 };

export class AuthenticationRequiredError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 503,
  ) {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export async function getAuthenticatedUser(): Promise<AuthenticationCheck> {
  if (!getNeonAuth()) {
    return {
      user: null,
      error: "Authentication is not configured.",
      status: 503,
    };
  }

  const user = await getCurrentUser();
  return user
    ? { user }
    : { user: null, error: "Sign in required.", status: 401 };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const result = await getAuthenticatedUser();
  if (!result.user) {
    throw new AuthenticationRequiredError(result.error, result.status);
  }
  return result.user;
}
