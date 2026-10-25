import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDesignDocument } from "@/lib/design-studio/document";
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: vi.fn() }));
const mocks = vi.hoisted(() => ({ render: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/server/workspace-access", () => ({ requireWorkspaceContext: mocks.context }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/server/design-studio/renderer", () => ({ renderDesignPage: mocks.render, getDesignFontCss: async () => "" }));
import { POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ workspaceId: "workspace", limits: { highResolutionExports: true, watermarked: false } }); });
function request(format: string, document = emptyDesignDocument()) {
  return new Request("https://example.test/api/design-studio/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, format, pageId: "page-1", scale: 2 }) });
}
describe("design exports", () => {
  it("preserves paid export entitlements while allowing editable backups", async () => {
    mocks.context.mockResolvedValue({ workspaceId: "workspace", limits: { highResolutionExports: false, watermarked: true } });
    expect((await POST(request("png"))).status).toBe(403);
    expect((await POST(request("html"))).status).toBe(403);
    expect((await POST(request("json"))).status).toBe(200);
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("uses server-side Pro Lite watermark policy for HTML and PNG exports", async () => {
    mocks.context.mockResolvedValue({ workspaceId: "workspace", limits: { highResolutionExports: true, watermarked: true } });
    const html = await POST(request("html"));
    expect(await html.text()).toContain("Made with EaseYourStartup");
    mocks.render.mockResolvedValue({ png: new Uint8Array([1]), issues: [] });
    expect((await POST(request("png"))).status).toBe(200);
    expect(mocks.render.mock.calls[0][2].watermark).toBe(true);
  });
  it("returns the renderer's exact PNG bytes and scale", async () => {
    mocks.render.mockResolvedValue({ png: new Uint8Array([137, 80, 78, 71]), issues: [], width: 2160, height: 2700 });
    const response = await POST(request("png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(mocks.render.mock.calls[0][2].scale).toBe(2);
  });
  it("blocks an accidentally clipped PNG while preserving editable document exports", async () => {
    mocks.render.mockResolvedValue({ png: new Uint8Array([1]), issues: [{ pageId: "page-1", nodeId: "headline", code: "text_overflow", severity: "error", message: "Text does not fit" }] });
    const response = await POST(request("png"));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("headline");
    const source = await POST(request("json"));
    expect(source.status).toBe(200);
    expect((await source.json()).pages[0].nodes[0].text).toBe("Your next\nbig idea.");
  });
  it("does not issue a misleading partial carousel archive if any slide fails checks", async () => {
    const document = emptyDesignDocument(); document.pages.push({ ...document.pages[0], id: "page-2", name: "Second" });
    mocks.render.mockResolvedValueOnce({ png: new Uint8Array([1]), issues: [] }).mockResolvedValueOnce({ png: new Uint8Array([1]), issues: [{ pageId: "page-2", code: "missing_asset", severity: "error", message: "Missing image" }] });
    const response = await POST(request("zip", document));
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
