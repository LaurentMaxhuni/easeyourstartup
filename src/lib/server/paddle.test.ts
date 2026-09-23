import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyPaddleWebhookSignature } from "@/lib/server/paddle";

describe("verifyPaddleWebhookSignature", () => {
  const now = 1_700_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const payload = '{"event_id":"evt_test"}';
  const secret = "pdl_ntfset_test";
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}:${payload}`)
    .digest("hex");

  it("accepts a valid current signature", () => {
    expect(
      verifyPaddleWebhookSignature(
        payload,
        `ts=${timestamp};h1=${digest}`,
        secret,
        now,
      ),
    ).toBe(true);
  });

  it("rejects tampered and stale payloads", () => {
    expect(
      verifyPaddleWebhookSignature(
        '{"event_id":"evt_tampered"}',
        `ts=${timestamp};h1=${digest}`,
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      verifyPaddleWebhookSignature(
        payload,
        `ts=${timestamp - 6};h1=${digest}`,
        secret,
        now,
      ),
    ).toBe(false);
  });
});
