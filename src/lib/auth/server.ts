import "server-only";

import {
  createNeonAuth,
  type NeonAuth,
} from "@neondatabase/auth/next/server";

let cachedAuth: NeonAuth | null | undefined;
const AUTH_RETRY_DELAYS_MS = [250, 500, 1_000] as const;
const RETRYABLE_AUTH_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function authErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return 0;
  const value = error as Record<string, unknown>;
  const response = typeof value.response === "object" && value.response !== null
    ? value.response as Record<string, unknown>
    : null;
  const cause = typeof value.cause === "object" && value.cause !== null
    ? value.cause as Record<string, unknown>
    : null;
  const causeResponse = cause && typeof cause.response === "object" && cause.response !== null
    ? cause.response as Record<string, unknown>
    : null;
  for (const candidate of [value.status, value.statusCode, response?.status, cause?.status, causeResponse?.status]) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status > 0) return status;
  }
  return 0;
}

function authErrorSummary(error: unknown) {
  if (typeof error !== "object" || error === null) return "status=unknown code=unknown";
  const status = authErrorStatus(error) || "unknown";
  const rawCode = "code" in error && typeof error.code === "string"
    ? error.code
    : "cause" in error && typeof error.cause === "object" && error.cause !== null &&
        "code" in error.cause && typeof error.cause.code === "string"
      ? error.cause.code
    : error instanceof TypeError && /fetch|network|socket|connection|timed out/i.test(error.message)
      ? "NETWORK_ERROR"
      : "unknown";
  const code = /^[A-Za-z0-9_-]{1,40}$/.test(rawCode) ? rawCode : "other";
  const name = error instanceof Error && /^[A-Za-z0-9_-]{1,40}$/.test(error.name)
    ? error.name
    : "unknown";
  return `name=${name} status=${status} code=${code}`;
}

function isRetryableNetworkException(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error && typeof error.code === "string"
    ? error.code
    : "cause" in error && typeof error.cause === "object" && error.cause !== null &&
        "code" in error.cause && typeof error.cause.code === "string"
      ? error.cause.code
      : "";
  return RETRYABLE_NETWORK_CODES.has(code) ||
    (error instanceof TypeError && /fetch|network|socket|connection|timed out/i.test(error.message));
}

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
  for (let attempt = 0; ; attempt += 1) {
    let result;
    try {
      result = await auth.getSession();
    } catch (error) {
      const status = authErrorStatus(error);
      if (
        !isRetryableNetworkException(error) &&
        !RETRYABLE_AUTH_STATUSES.has(status)
      ) {
        throw error;
      }
      if (attempt === AUTH_RETRY_DELAYS_MS.length) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[auth] getSession exhausted ${attempt + 1} attempts (${authErrorSummary(error)})`,
          );
        }
        throw error;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]),
      );
      continue;
    }

    if (!result.error) return result;

    const status = authErrorStatus(result.error);
    const code = "code" in result.error ? result.error.code : "";
    const retryableNetworkError = status === 0 && code === "NETWORK_ERROR";
    if (!RETRYABLE_AUTH_STATUSES.has(status) && !retryableNetworkError) {
      return result;
    }

    if (attempt === AUTH_RETRY_DELAYS_MS.length) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[auth] getSession exhausted ${attempt + 1} attempts (${authErrorSummary(result.error)})`,
        );
      }
      return result;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]),
    );
  }
}

async function getCurrentSession() {
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

function authenticationUnavailable(): AuthenticationCheck {
  return {
    user: null,
    error: "We couldn't verify your session. Try again in a moment.",
    status: 503,
  };
}

function sessionRejected(error: unknown) {
  return authErrorStatus(error) === 401;
}

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
  const auth = getNeonAuth();
  if (!auth) return authenticationUnavailable();

  try {
    const { data, error } = await getSessionWithTransientRetry(auth);
    if (error) {
      if (sessionRejected(error)) {
        return { user: null, error: "Sign in required.", status: 401 };
      }
      const status = authErrorStatus(error);
      const code = "code" in error && typeof error.code === "string" ? error.code : "";
      if (
        process.env.NODE_ENV !== "production" &&
        !RETRYABLE_AUTH_STATUSES.has(status) &&
        !(status === 0 && code === "NETWORK_ERROR")
      ) {
        console.warn(`[auth] getSession returned error (${authErrorSummary(error)})`);
      }
      return authenticationUnavailable();
    }

    const user = data?.user ?? null;
    return user
      ? { user }
      : { user: null, error: "Sign in required.", status: 401 };
  } catch (error) {
    console.warn(`[auth] getSession failed (${authErrorSummary(error)})`);
    return authenticationUnavailable();
  }
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const result = await getAuthenticatedUser();
  if (!result.user) {
    throw new AuthenticationRequiredError(result.error, result.status);
  }
  return result.user;
}
