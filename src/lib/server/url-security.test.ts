import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { lookupMock, dispatcherLookups } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
  dispatcherLookups: [] as unknown[],
}));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("undici", () => ({
  Agent: class {
    constructor(options: { connect: { lookup: unknown } }) {
      dispatcherLookups.push(options.connect.lookup);
    }
    close() { return Promise.resolve(); }
  },
}));

import {
  isPrivateIpAddress,
  parsePublicHttpUrl,
  safeFetchImage,
  safeFetchHtml,
} from "@/lib/server/url-security";

describe("URL security", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    lookupMock.mockReset();
    dispatcherLookups.length = 0;
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.4.2",
    "192.168.1.1",
    "192.88.99.1",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "2001:0::1",
    "2002:0808:0808::1",
    "64:ff9b::808:808",
  ])("blocks private or reserved address %s", (address) => {
    expect(isPrivateIpAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isPrivateIpAddress(address)).toBe(false);
    },
  );

  it("rejects non-web protocols and credentials", () => {
    expect(() => parsePublicHttpUrl("file:///etc/passwd")).toThrow(/HTTP/);
    expect(() =>
      parsePublicHttpUrl("https://user:password@example.com"),
    ).toThrow(/credentials/);
  });

  it("rejects bracketed IPv6 loopback destinations", () => {
    expect(() => parsePublicHttpUrl("http://[::1]/admin")).toThrow(/Private|local/);
  });

  it("pins connections to the address that passed the public-address check", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>safe</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })));

    await safeFetchHtml("https://example.com");

    expect(lookupMock).toHaveBeenCalledTimes(1);
    const pinnedLookup = dispatcherLookups[0] as (
      hostname: string,
      options: { all?: boolean; family?: number },
      callback: (error: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
    ) => void;
    const result = await new Promise<unknown>((resolve) => {
      pinnedLookup("example.com", { family: 4 }, (...values) => resolve(values));
    });
    expect(result).toEqual([null, "93.184.216.34", 4]);
  });

  it("rejects a redirect to a loopback address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
      ),
    );
    await expect(safeFetchHtml("http://8.8.8.8")).rejects.toThrow(
      /Private|reserved/,
    );
  });

  it("enforces the streamed response size limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>" + "x".repeat(100) + "</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(
      safeFetchHtml("http://8.8.8.8", { maxBytes: 50 }),
    ).rejects.toThrow(/too large/);
  });

  it("returns validated raster image bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );

    const result = await safeFetchImage("http://8.8.8.8");

    expect(result.contentType).toBe("image/png");
    expect(new Uint8Array(result.buffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects non-image responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(safeFetchImage("http://8.8.8.8")).rejects.toThrow(
      /image/i,
    );
  });

  it("rejects image redirects into private destinations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        }),
      ),
    );

    await expect(safeFetchImage("http://8.8.8.8")).rejects.toThrow(
      /Private|reserved/,
    );
  });
});
