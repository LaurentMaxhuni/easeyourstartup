import { describe, expect, it } from "vitest";
import type { BrandProfile, StudioDraft } from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { designDocumentSchema } from "./document";
import { campaignTemplateConcepts } from "./campaign-templates";

const draft: StudioDraft = {
  kind: "feature_update", goal: "Announce our new export workflow",
  updateDetails: "Export your project in one click. Available in your workspace today.",
  audience: "Product teams", launchDate: "", cta: "Try the update",
  angle: DEMO_ANGLES[0], channels: ["linkedin"],
};
const brand: BrandProfile = { ...DEMO_BRAND, voice: ["Clear"], brandIntelligence: undefined, visualSystem: undefined, audience: "Product teams", fonts: ["Inter"], colors: ["#ffffff", "#f05228"] };

describe("instant campaign templates", () => {
  it("returns three distinct, deterministic, editable designs using the founder's announcement", () => {
    const concepts = campaignTemplateConcepts({ brand, draft });
    expect(concepts).toHaveLength(3);
    expect(new Set(concepts.map((concept) => concept.id)).size).toBe(3);
    expect(campaignTemplateConcepts({ brand, draft })).toEqual(concepts);
    for (const concept of concepts) {
      expect(designDocumentSchema.safeParse(concept.document).success).toBe(true);
      expect(concept.document.pages[0]).toMatchObject({ width: 1080, height: 1080 });
      expect(concept.document.pages[0].nodes.find((node) => node.role === "headline")?.text).toBe("Export your project in one click.");
      expect(concept.message).toBe(draft.updateDetails);
      expect(concept.document.pages[0].nodes.some((node) => node.type === "text" && node.text.includes("Try the update"))).toBe(true);
    }
  });

  it.each([
    { voice: ["Technical", "Engineered"], audience: "API developers", want: "tech-grid" },
    { voice: ["Premium", "Restrained", "Calm"], audience: "Design studios", want: "quiet-minimal" },
    { voice: ["Playful", "Bold", "Energetic"], audience: "Creative teams", want: "big-type" },
  ])("prioritizes $want for the scanned brand character", ({ voice, audience, want }) => {
    const concepts = campaignTemplateConcepts({ brand: { ...brand, voice, audience }, draft: { ...draft, kind: "launch" } });
    expect(concepts[0].id).toBe(want);
  });

  it("matches campaign kind without treating unsupported product claims as copy", () => {
    const promotion = campaignTemplateConcepts({ brand, draft: { ...draft, kind: "promotion" } });
    expect(promotion[0].id).toBe("split-field");
    const waitlist = campaignTemplateConcepts({ brand, draft: { ...draft, kind: "waitlist" } });
    expect(waitlist[0].id).toBe("spotlight");
    expect(waitlist[0].document.pages[0].nodes.some((node) => /50%|trusted by|10,000/i.test(node.text))).toBe(false);
  });

  it("uses only available image assets and excludes reference captures from output", () => {
    const image = { id: "shot", name: "Product screenshot", kind: "image" as const, description: "", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    expect(campaignTemplateConcepts({ brand, draft }).some((concept) => concept.id === "product-hero")).toBe(false);
    const referencesOnly = campaignTemplateConcepts({ brand, draft, assets: [{ ...image, kind: "reference" }] });
    expect(referencesOnly.some((concept) => concept.id === "product-hero")).toBe(false);
    const withImage = campaignTemplateConcepts({ brand, draft, assets: [image] });
    expect(withImage[0].id).toBe("product-hero");
    expect(withImage[0].document.pages[0].nodes.some((node) => node.type === "image" && node.assetId === "shot")).toBe(true);
  });

  it("bounds unbroken and long announcements while preserving the full approved message", () => {
    const message = "A".repeat(1900);
    const concepts = campaignTemplateConcepts({ brand, draft: { ...draft, updateDetails: message, cta: "Read the announcement ".repeat(10) } });
    for (const concept of concepts) {
      expect(concept.message).toBe(message);
      const page = concept.document.pages[0];
      expect(page.nodes.find((node) => node.role === "headline")!.text.length).toBeLessThanOrEqual(110);
      for (const node of page.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(1080.5);
        expect(node.y + node.height).toBeLessThanOrEqual(1080.5);
      }
    }
  });
});
