import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createPrivateObjectReadUrl, deletePrivateObject, getPrivateObject, putPrivateObject } from "./object-storage";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
function expectedSignature(canonicalRequest: string) {
  const key = hmac(hmac(hmac(hmac("AWS4test-secret", "20261006"), "us-east-1"), "s3"), "aws4_request");
  return createHmac("sha256", key)
    .update(`AWS4-HMAC-SHA256\n20261006T120000Z\n20261006/us-east-1/s3/aws4_request\n${hash(canonicalRequest)}`)
    .digest("hex");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  vi.stubEnv("S3_ENDPOINT", "https://s3.example.test");
  vi.stubEnv("S3_BUCKET", "test-bucket");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("S3 Signature V4 canonical headers", () => {
  it.each(["PUT", "GET", "DELETE"] as const)("signs %s with terminated canonical headers", async (method) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array()));
    vi.stubGlobal("fetch", fetchMock);
    const body = new TextEncoder().encode("test payload");
    if (method === "PUT") await putPrivateObject("assets/test.webp", body, "image/webp");
    if (method === "GET") await getPrivateObject("assets/test.webp");
    if (method === "DELETE") await deletePrivateObject("assets/test.webp");
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    const payloadHash = hash(method === "PUT" ? body : new Uint8Array());
    const canonicalRequest = `${method}\n/test-bucket/assets/test.webp\n\nhost:s3.example.test\nx-amz-content-sha256:${payloadHash}\nx-amz-date:20261006T120000Z\n\nhost;x-amz-content-sha256;x-amz-date\n${payloadHash}`;
    expect(headers.get("authorization")?.split("Signature=")[1]).toBe(expectedSignature(canonicalRequest));
  });

  it("signs presigned reads with terminated canonical headers", () => {
    const url = new URL(createPrivateObjectReadUrl("assets/test.webp", 900));
    const query = "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test-key%2F20261006%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261006T120000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host";
    const canonicalRequest = `GET\n/test-bucket/assets/test.webp\n${query}\nhost:s3.example.test\n\nhost\nUNSIGNED-PAYLOAD`;
    expect(url.searchParams.get("X-Amz-Signature")).toBe(expectedSignature(canonicalRequest));
  });
});
