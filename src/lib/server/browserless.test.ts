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
    const filters = (requests[0]?.rejectRequestPattern ?? []).map((pattern) => {
      const delimiter = pattern.lastIndexOf("/");
      return new RegExp(pattern.slice(1, delimiter), pattern.slice(delimiter + 1));
    });
    expect(filters.some((filter) => filter.test("http://127.0.0.1/"))).toBe(true);
    expect(filters.some((filter) => filter.test("http://[::1]/"))).toBe(true);
    expect(filters.some((filter) => filter.test("https://example.com/"))).toBe(false);
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
