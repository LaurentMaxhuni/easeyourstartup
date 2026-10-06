import { NextResponse } from "next/server";
import { getAuthenticatedUser, getNeonAuth } from "@/lib/auth/server";
import { createDatabase } from "@/lib/server/database";
import { assertSameOrigin } from "@/lib/server/request-security";

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

function withDeletionGuard(handler: typeof getWithTransientRetry | undefined) {
  return async (request: Request, context: RouteContext) => {
    if (!handler) return unavailable(request, context);
    const { path } = await context.params;
    if (path[0] === "delete-user") {
      try {
        if (request.method !== "GET") assertSameOrigin(request);
        const auth = await getAuthenticatedUser();
        if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const database = createDatabase();
        if (!database) return temporarilyUnavailable();
        const [prepared] = await database`
          select workspace_id from public.account_deletion_requests
          where user_id = ${auth.user.id}::uuid and expires_at > pg_catalog.now()
          limit 1
        `;
        if (!prepared) {
          return NextResponse.json({ error: "Prepare account deletion in account settings before confirming it." }, { status: 409 });
        }
        const [check] = await database`
          select * from public.prepare_account_deletion(
            ${auth.user.id}::text, ${prepared.workspace_id}::uuid
          )
        `;
        if (check?.allowed !== true) {
          return NextResponse.json({ error: "Account deletion is blocked by billing, shared membership, or active jobs. Reopen account settings." }, { status: 409 });
        }
      } catch {
        return NextResponse.json({ error: "Account deletion could not be verified." }, { status: 503 });
      }
    }
    return handler(request, context);
  };
}

export const GET = withDeletionGuard(handlers?.GET ? getWithTransientRetry : undefined);
export const POST = withDeletionGuard(handlers?.POST);
export const PUT = withDeletionGuard(handlers?.PUT);
export const PATCH = withDeletionGuard(handlers?.PATCH);
export const DELETE = withDeletionGuard(handlers?.DELETE);
