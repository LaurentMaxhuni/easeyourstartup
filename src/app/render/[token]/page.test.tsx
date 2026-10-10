import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";

const mocks = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/database", () => ({ createDatabase: () => mocks.database }));
vi.mock("@/components/render-readiness-signal", () => ({ RenderReadinessSignal: () => null }));
import InternalRenderPage from "./page";

beforeEach(() => vi.clearAllMocks());

it.each([true, false, undefined])("renders the trusted watermark flag %s", async (watermarked) => {
  mocks.database.mockResolvedValue([{ composition: { ...DEMO_COMPOSITION, watermarked } }]);
  const page = await InternalRenderPage({ params: Promise.resolve({ token: "a".repeat(43) }) });
  const markup = renderToStaticMarkup(page);
  expect(markup.includes("Made with EaseYourStartup")).toBe(watermarked !== false);
});
