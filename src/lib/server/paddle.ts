import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const PADDLE_API_VERSION = "1";
const PADDLE_SANDBOX_API_URL = "https://sandbox-api.paddle.com";
const PADDLE_LIVE_API_URL = "https://api.paddle.com";

export type PaddleApiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type PaddleTransaction = {
  id: string;
  subscription_id?: string | null;
  checkout?: {
    url?: string | null;
  } | null;
};

export type PaddlePortalSession = {
  urls?: {
    general?: {
      overview?: string | null;
    } | null;
  } | null;
};

type PaddleRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

class PaddleApiError extends Error {
  constructor(public readonly status: number) {
    super(`Paddle API request failed with status ${status}.`);
    this.name = "PaddleApiError";
  }
}

export function getPaddleConfig() {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) return null;

  const environment = (
    process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() ?? "production"
  ) as "production" | "sandbox";
  if (environment !== "production" && environment !== "sandbox") return null;

  return {
    apiKey,
    environment,
    baseUrl:
      environment === "sandbox" ? PADDLE_SANDBOX_API_URL : PADDLE_LIVE_API_URL,
  };
}

export async function paddleRequest<T>(
  path: string,
  options: PaddleRequestOptions = {},
): Promise<PaddleApiResponse<T>> {
  const config = getPaddleConfig();
  if (!config) throw new Error("Paddle is not configured.");

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Paddle-Version": PADDLE_API_VERSION,
    },
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | PaddleApiResponse<T>
    | null;
  if (!response.ok) throw new PaddleApiError(response.status);
  if (!payload || !payload.data) {
    throw new Error("Paddle returned an invalid response.");
  }
  return payload;
}

export function verifyPaddleWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  now = Date.now(),
  toleranceSeconds = 5,
) {
  if (!signatureHeader || !secret) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1") signatures.push(value);
  }

  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (
    Math.abs(Math.floor(now / 1000) - timestampSeconds) > toleranceSeconds
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${payload}`)
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}
