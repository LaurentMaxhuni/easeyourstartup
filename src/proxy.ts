import { NextResponse, type NextRequest } from "next/server";
import { getNeonAuth } from "@/lib/auth/server";
import { hasNeonAuthSessionVerifier } from "@/lib/auth/navigation";

const neonAuthMiddleware = getNeonAuth()?.middleware({ loginUrl: "/login" });

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const developmentScriptPolicy =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const upgradePolicy =
    process.env.NODE_ENV === "production" ? "upgrade-insecure-requests" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptPolicy} https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com https://*.neon.tech https://*.neon.build https://*.browserless.io https://api.stripe.com https://*.inngest.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    upgradePolicy,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response =
    neonAuthMiddleware && hasNeonAuthSessionVerifier(request.url)
      ? await neonAuthMiddleware(request)
      : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
