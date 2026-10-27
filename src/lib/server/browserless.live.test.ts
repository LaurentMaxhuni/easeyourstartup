import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { captureWebsite } from "./browserless";

describe.skipIf(process.env.RUN_LIVE_CAPTURE_TESTS !== "true")("live website capture", () => {
  it("captures a public website through the configured provider", async () => {
    for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
    const image = await captureWebsite("https://kombai.com/", "desktop", { fullPage: false });
    expect(image.contentType).toContain("image/png");
    expect(image.buffer.byteLength).toBeGreaterThan(1000);
  }, 40000);
});
