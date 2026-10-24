import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { assertPublicHttpUrlMock, isPrivateIpAddressMock, parsePublicHttpUrlMock } = vi.hoisted(() => ({
  assertPublicHttpUrlMock: vi.fn(async (value: string) => new URL(value)),
  isPrivateIpAddressMock: vi.fn((address: string) => address === "10.0.0.8"),
  parsePublicHttpUrlMock: vi.fn((value: string) => new URL(value)),
}));

vi.mock("@/lib/server/url-security", () => ({
  assertPublicHttpUrl: assertPublicHttpUrlMock,
  isPrivateIpAddress: isPrivateIpAddressMock,
  parsePublicHttpUrl: parsePublicHttpUrlMock,
}));

import { captureCompositionPng, captureWebsite } from "@/lib/server/browserless";

describe("Browserless capture boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BROWSERLESS_API_URL", "https://browserless.example");
    vi.stubEnv("BROWSERLESS_API_KEY", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "x-response-url": "https://example.com/",
        "x-response-ip": "93.184.216.34",
        "x-response-code": "200",
      },
    })));
  });

  it("rejects private and local destinations in page requests", async () => {
    await captureWebsite("https://example.com", "desktop");
    await captureCompositionPng("https://example.com/render/token", { width: 1080, height: 1080 });

    const requests = vi.mocked(fetch).mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as { rejectRequestPattern?: string[] });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.rejectRequestPattern).toEqual(expect.arrayContaining([
        expect.stringContaining("localhost"),
        expect.stringContaining("169"),
        expect.stringContaining("127"),
      ]));
    }
    // Match exactly as Browserless does, without repairing serialized patterns.
    const blocked = (url: string) => requests[0]?.rejectRequestPattern?.some((pattern) => url.match(pattern));
    for (const host of [
      "localhost", "app.localhost", "metadata.google.internal", "instance-data", "app.local", "app.internal",
      "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
      "192.0.0.8", "192.0.2.1", "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.255",
      "198.51.100.1", "203.0.113.1", "100.64.0.1", "100.127.255.255", "224.0.0.1", "255.255.255.255",
      "[::1]", "[fd00::1]", "[::ffff:127.0.0.1]",
    ]) {
      expect(blocked(`http://${host}/`), host).toBe(true);
      expect(blocked(`https://${host}:8443/path?q=1`), host).toBe(true);
    }
    for (const host of ["example.com", "8.8.8.8", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "10.example.com"]) {
      expect(blocked(`https://${host}/`), host).toBe(false);
    }
  });

  it("fails closed when Browserless reports a private connected address", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "x-response-url": "http://10.0.0.8/",
        "x-response-ip": "10.0.0.8",
        "x-response-code": "200",
      },
    }));

    await expect(captureWebsite("https://example.com", "mobile"))
      .rejects.toThrow("The website could not be captured.");
  });
});
