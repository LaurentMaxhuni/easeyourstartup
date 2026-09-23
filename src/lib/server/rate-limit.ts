import "server-only";

import { createHash } from "node:crypto";
import { createDatabase } from "@/lib/server/database";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let requestsSinceCleanup = 0;

export function getRequestIdentity(request: Request, scope?: string) {
  if (scope) return `workspace:${scope}`;
  if (!process.env.VERCEL) return "local";
  return `ip:${
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  }`;
}

export async function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
) {
  const database = createDatabase();
  if (database) {
    const bucketKey = createHash("sha256").update(key).digest("hex");
    const [bucket] = await database`
      insert into public.rate_limit_buckets (bucket_key, window_started_at, request_count)
      values (${bucketKey}, now(), 1)
      on conflict (bucket_key) do update set
        request_count = case
          when public.rate_limit_buckets.window_started_at <= now() - (${options.windowMs} * interval '1 millisecond') then 1
          else public.rate_limit_buckets.request_count + 1
        end,
        window_started_at = case
          when public.rate_limit_buckets.window_started_at <= now() - (${options.windowMs} * interval '1 millisecond') then now()
          else public.rate_limit_buckets.window_started_at
        end
      returning request_count,
        extract(epoch from (window_started_at + (${options.windowMs} * interval '1 millisecond')) - now()) * 1000 as remaining_ms
    `;
    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 100) {
      requestsSinceCleanup = 0;
      void database`
        delete from public.rate_limit_buckets
        where window_started_at < now() - interval '1 day'
      `.catch((error) => console.error("[rate-limit] Expired buckets could not be cleaned.", error));
    }
    const count = Number(bucket?.request_count ?? Number.POSITIVE_INFINITY);
    const remainingMs = Math.max(0, Number(bucket?.remaining_ms ?? 0));
    return count <= options.limit
      ? { allowed: true, remaining: options.limit - count }
      : { allowed: false, remaining: 0, retryAfterMs: remainingMs };
  }

  if (process.env.VERCEL) return { allowed: false, remaining: 0, retryAfterMs: options.windowMs };
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
