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

import { captureCompositionPng, captureScanPreview, captureWebsite } from "@/lib/server/browserless";

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

  it("waits for visible content without requiring persistent site requests to stop", async () => {
    await captureWebsite("https://example.com", "desktop", { fullPage: false });
    const request = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(request.gotoOptions).toEqual({ waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(request.waitForTimeout).toBe(1_500);
    expect(request.options.fullPage).toBe(false);
  });

  describe("scan preview", () => {
    const previewResponse = (data: Record<string, unknown>) => new Response(JSON.stringify({
      data: {
        url: "https://example.com/",
        ip: "93.184.216.34",
        status: 200,
        image: "aGVsbG8=",
        title: "Example",
        elements: [{ kind: "headline", text: "Ship faster", x: 0.1, y: 0.3, w: 0.5, h: 0.1 }],
        palette: ["#ffffff"],
        fonts: ["Inter"],
        ...data,
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    it("blocks private requests inside the browser function and returns element boxes", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(previewResponse({}));
      const preview = await captureScanPreview("https://example.com");
      expect(preview).toMatchObject({ image: "aGVsbG8=", elements: [expect.objectContaining({ kind: "headline" })] });
      expect(preview).not.toHaveProperty("ip");
      const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(String(url)).toContain("/function?token=");
      const request = JSON.parse(String(init?.body)) as { code: string; context: { rejectRequestPattern: string[] } };
      expect(request.code).toContain("setRequestInterception(true)");
      expect(request.context.rejectRequestPattern).toEqual(expect.arrayContaining([expect.stringContaining("localhost")]));
    });

    it("fails closed on private destinations, failed pages, and malformed output", async () => {
      for (const data of [{ ip: "10.0.0.8" }, { ip: "" }, { status: 500 }, { elements: [{ kind: "script", text: "", x: 0, y: 0, w: 1, h: 1 }] }]) {
        vi.mocked(fetch).mockResolvedValueOnce(previewResponse(data));
        await expect(captureScanPreview("https://example.com")).rejects.toThrow("The website could not be captured.");
      }
    });
  });
});
