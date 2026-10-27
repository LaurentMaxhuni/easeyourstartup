import "server-only";

import { createHash, createHmac } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

const S3_SETTINGS = ["S3_ENDPOINT", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
const MAX_DATABASE_OBJECT_BYTES = 20_000_000;

/**
 * File bytes use a WebSocket connection: the HTTP query driver sends bytea as
 * hex text, which measured 3-5x slower (about 20 s for a 2 MB file).
 */
async function queryObjects<T extends Record<string, unknown>>(text: string, values: unknown[]) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Private object storage is not configured: no S3 settings or database.");
  const pool = new Pool({ connectionString });
  try {
    return (await pool.query<T>(text, values)).rows;
  } finally {
    await pool.end();
  }
}

/** S3 when fully configured; the database when no S3 setting is present. */
function storageMode(): "s3" | "database" {
  const present = S3_SETTINGS.filter((name) => process.env[name]?.trim());
  if (present.length === S3_SETTINGS.length) return "s3";
  if (present.length === 0) return "database";
  throw new Error("Private object storage is not configured: set every S3 setting or none of them.");
}

function requiredConfig() {
  const endpointValue = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpointValue || !bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Private object storage is not configured.");
  }
  const endpoint = new URL(endpointValue);
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Object storage endpoint is invalid.");
  }
  if (endpoint.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Object storage must use HTTPS in production.");
  }
  return { endpoint, bucket, region, accessKeyId, secretAccessKey };
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function objectUrl(endpoint: URL, bucket: string, key: string) {
  const path = [endpoint.pathname.replace(/\/$/, ""), awsEncode(bucket), ...key.split("/").map(awsEncode)]
    .filter(Boolean)
    .join("/");
  const url = new URL(endpoint);
  url.pathname = `/${path}`;
  return url;
}

async function requestObject(method: "PUT" | "GET" | "DELETE", key: string, body?: Uint8Array, mimeType?: string) {
  const config = requiredConfig();
  const url = objectUrl(config.endpoint, config.bucket, key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const payloadHash = digest(body ?? new Uint8Array());
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, digest(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, shortDate), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const headers = new Headers({
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  });
  if (mimeType) headers.set("Content-Type", mimeType);
  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body: new Uint8Array(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    if (method === "GET" && response.status === 404) throw new Error("Stored asset was not found.");
    throw new Error(`Object storage request failed (${response.status}).`);
  }
  return response;
}

export async function putPrivateObject(key: string, body: Uint8Array, mimeType: string) {
  if (storageMode() === "s3") {
    await requestObject("PUT", key, body, mimeType);
  } else {
    if (body.byteLength === 0 || body.byteLength > MAX_DATABASE_OBJECT_BYTES) {
      throw new Error("Files over 20 MB need S3-compatible object storage.");
    }
    await queryObjects(
      `insert into public.private_objects (object_key, mime_type, body)
      values ($1, $2, $3)
      on conflict (object_key) do update set mime_type = excluded.mime_type, body = excluded.body, created_at = now()`,
      [key, mimeType, Buffer.from(body)],
    );
  }
  return { byteSize: body.byteLength, sha256: digest(body) };
}

export async function getPrivateObject(key: string) {
  if (storageMode() === "s3") {
    const response = await requestObject("GET", key);
    return new Uint8Array(await response.arrayBuffer());
  }
  const [row] = await queryObjects<{ body: Buffer }>(
    "select body from public.private_objects where object_key = $1",
    [key],
  );
  if (!Buffer.isBuffer(row?.body)) throw new Error("Stored asset was not found.");
  return new Uint8Array(row.body);
}

export async function deletePrivateObject(key: string) {
  if (storageMode() === "s3") {
    await requestObject("DELETE", key);
    return;
  }
  await queryObjects("delete from public.private_objects where object_key = $1", [key]);
}

export function createPrivateObjectReadUrl(key: string, expiresInSeconds = 300) {
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new Error("Object URL expiry is invalid.");
  }
  const config = requiredConfig();
  const url = objectUrl(config.endpoint, config.bucket, key);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const entries: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = entries
    .map(([name, value]) => [awsEncode(name), awsEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    digest(canonicalRequest),
  ].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, shortDate), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}
