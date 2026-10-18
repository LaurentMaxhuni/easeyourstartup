import { expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/contracts";
const mocks = vi.hoisted(() => ({ curate: vi.fn(), interpret: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/campaign-generator", async (importOriginal) => ({
  ...await importOriginal<typeof import("./campaign-generator")>(),
  curateScannedClaims: mocks.curate,
  requestStructuredAiJson: mocks.interpret,
}));
import { enrichScannedWebsite } from "./brand-intelligence";
import { DEMO_SCAN } from "@/lib/demo-data";

it("interprets source-filtered evidence while curation runs, preserving the curated claims", async () => {
  let finishCuration!: (value: ScanResult) => void;
  mocks.curate.mockReturnValue(new Promise<ScanResult>((resolve) => { finishCuration = resolve; }));
  mocks.interpret.mockRejectedValue(new Error("Provider unavailable"));
  const source = { ...DEMO_SCAN, mode: "live" as const };
  const result = enrichScannedWebsite(source);
  expect(mocks.curate).toHaveBeenCalledWith(source);
  expect(mocks.interpret).toHaveBeenCalledOnce();
  const curated = { ...source, profile: { ...source.profile, claims: source.profile.claims.slice(0, 1) } };
  finishCuration(curated);
  expect((await result).profile).toMatchObject({
    claims: curated.profile.claims,
    brandIntelligence: expect.objectContaining({ productPurpose: source.profile.tagline }),
  });
  expect(source.profile.brandIntelligence).toBeUndefined();
});
