import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function getRequestIdentity(request: Request) {
  if (!process.env.VERCEL) return "local";
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.limit - 1 };
  }
  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count };
}
