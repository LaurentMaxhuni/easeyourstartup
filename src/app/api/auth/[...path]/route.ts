import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const auth = getNeonAuth();
const handlers = auth?.handler();
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

async function unavailable(request: Request, context: RouteContext) {
  void request;
  void context;
  return NextResponse.json(
    { error: "Authentication is not configured in this environment." },
    { status: 503 },
  );
}

function temporarilyUnavailable() {
  return NextResponse.json(
    { error: "Authentication is temporarily unavailable. Please try again." },
    { status: 503 },
  );
}

async function getWithTransientRetry(request: Request, context: RouteContext) {
  const handler = handlers?.GET;
  if (!handler) return unavailable(request, context);
  const { path } = await context.params;
  if (path.length !== 1 || path[0] !== "get-session") {
    return handler(request, context);
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await handler(request, context);
      if (!RETRYABLE_AUTH_STATUSES.has(response.status)) return response;
      if (attempt === AUTH_RETRY_DELAYS_MS.length) {
        return temporarilyUnavailable();
      }
    } catch (error) {
      if (!isRetryableNetworkException(error)) throw error;
      if (attempt === AUTH_RETRY_DELAYS_MS.length) {
        return temporarilyUnavailable();
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, AUTH_RETRY_DELAYS_MS[attempt]),
    );
  }
}

export const GET = handlers?.GET ? getWithTransientRetry : unavailable;
export const POST = handlers?.POST ?? unavailable;
export const PUT = handlers?.PUT ?? unavailable;
export const PATCH = handlers?.PATCH ?? unavailable;
export const DELETE = handlers?.DELETE ?? unavailable;
