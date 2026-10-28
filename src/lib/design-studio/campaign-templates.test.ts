import { describe, expect, it } from "vitest";
import type { BrandProfile, StudioDraft } from "@/lib/contracts";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { designDocumentSchema } from "./document";
import { availableTemplates } from "./templates";
import { campaignTemplateCatalog, campaignTemplateConcepts } from "./campaign-templates";

const draft: StudioDraft = {
  kind: "feature_update", goal: "Announce our new export workflow",
  updateDetails: "Export your project in one click. Available in your workspace today. Read the complete update in your workspace.",
  audience: "Product teams", launchDate: "", cta: "Try the update",
  angle: DEMO_ANGLES[0], channels: ["linkedin"],
};
const brand: BrandProfile = { ...DEMO_BRAND, tagline: "Turn every ship into a campaign.", voice: ["Clear"], brandIntelligence: undefined, visualSystem: undefined, audience: "Product teams", fonts: ["Inter"], colors: ["#ffffff", "#f05228", "#182238"] };

describe("instant campaign templates", () => {
  it("returns three distinct graphic designs with different approved copy emphasis", () => {
    const concepts = campaignTemplateConcepts({ brand, draft });
    expect(concepts).toHaveLength(3);
    expect(new Set(concepts.map((concept) => concept.id)).size).toBe(3);
    expect(campaignTemplateConcepts({ brand, draft })).toEqual(concepts);
    const headlines = new Set(concepts.map((concept) => concept.document.pages[0].nodes.find((node) => node.role === "headline")?.text));
    expect(headlines).toEqual(new Set([
      "Export your project in one click.",
      "Available in your workspace today.",
      brand.tagline,
    ]));
    const messages = new Set(concepts.map((concept) => concept.message));
    expect(messages.size).toBe(3);
    const sourceSentences = ["Export your project in one click.", "Available in your workspace today.", "Read the complete update in your workspace."];
    const catalogById = new Map(campaignTemplateCatalog({ brand, draft }).map((concept) => [concept.id, concept]));
    for (const concept of concepts) {
      expect(designDocumentSchema.safeParse(concept.document).success).toBe(true);
      expect(concept.document.pages[0]).toMatchObject({ width: 1080, height: 1080 });
      expect(concept.message.length).toBeLessThanOrEqual(2000);
      expect(sourceSentences.every((sentence) => concept.message.includes(sentence))).toBe(true);
      expect(concept.document).toEqual(catalogById.get(concept.id)?.document);
      expect(concept.document.pages[0].nodes.some((node) => node.type === "text" && node.text.includes("Try the update"))).toBe(true);
      expect(concept.document.pages[0].nodes.some((node) => node.role === "decoration" && ["rect", "ellipse", "path", "line"].includes(node.type))).toBe(true);
      expect(concept.document.pages[0].nodes.filter((node) => node.type === "text").every((node) => node.fontFamily === "Inter")).toBe(true);
      expect([concept.document.brand.primary, concept.document.brand.secondary, concept.document.brand.background].every((color) => brand.colors.includes(color))).toBe(true);
    }
  });

  it.each([
    { voice: ["Technical", "Engineered"], audience: "API developers", want: "signal-grid" },
    { voice: ["Premium", "Restrained", "Calm"], audience: "Design studios", want: "orbit-launch" },
    { voice: ["Playful", "Bold", "Energetic"], audience: "Creative teams", want: "modular-collage" },
  ])("prioritizes $want for the scanned brand character", ({ voice, audience, want }) => {
    const concepts = campaignTemplateConcepts({ brand: { ...brand, voice, audience }, draft: { ...draft, kind: "launch" } });
    expect(concepts[0].id).toBe(want);
  });

  it("matches campaign kind without treating unsupported product claims as copy", () => {
    const promotion = campaignTemplateConcepts({ brand, draft: { ...draft, kind: "promotion" } });
    expect(promotion[0].id).toBe("modular-collage");
    const waitlist = campaignTemplateConcepts({ brand, draft: { ...draft, kind: "waitlist" } });
    expect(waitlist[0].id).toBe("orbit-launch");
    expect(waitlist[0].document.pages[0].nodes.some((node) => /50%|trusted by|10,000/i.test(node.text))).toBe(false);
  });

  it("reorders two approved announcement sentences and uses the approved tagline as a third angle", () => {
    const twoSentence = "Export your project in one click. Available in your workspace today.";
    const concepts = campaignTemplateConcepts({ brand, draft: { ...draft, updateDetails: twoSentence } });
    expect(new Set(concepts.map((concept) => concept.message)).size).toBe(3);
    for (const concept of concepts) {
      expect(concept.message).toContain("Export your project in one click.");
      expect(concept.message).toContain("Available in your workspace today.");
      expect(concept.message.length).toBeLessThanOrEqual(2000);
    }
  });

  it("lists every eligible branded template while excluding image-only choices without images", () => {
    const catalog = campaignTemplateCatalog({ brand, draft });
    expect(catalog.map((concept) => concept.id)).toEqual(availableTemplates([]).map((template) => template.id));
    expect(catalog).toHaveLength(availableTemplates([]).length);
    expect(catalog.every((concept) => designDocumentSchema.safeParse(concept.document).success)).toBe(true);

    const image = { id: "shot", name: "Product screenshot", kind: "image" as const, description: "", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    const withImage = campaignTemplateCatalog({ brand, draft, assets: [image] });
    expect(withImage.map((concept) => concept.id)).toEqual(availableTemplates([image]).map((template) => template.id));
    expect(withImage.some((concept) => concept.id === "product-hero")).toBe(true);
  });

  it("reports unsupported brand fonts while rendering with the closest bundled family", () => {
    const unsupported = { ...brand, fonts: ["Acme Grotesk"], visualSystem: undefined };
    const concepts = campaignTemplateConcepts({ brand: unsupported, draft });
    for (const concept of concepts) {
      expect(concept.description).toContain("Acme Grotesk → Inter");
      expect(concept.document.pages[0].nodes.filter((node) => node.type === "text").every((node) => node.fontFamily === "Inter")).toBe(true);
    }
  });

  it("uses only available image assets and excludes reference captures from output", () => {
    const image = { id: "shot", name: "Product screenshot", kind: "image" as const, description: "", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
    expect(campaignTemplateConcepts({ brand, draft }).some((concept) => concept.id === "product-hero")).toBe(false);
    const referencesOnly = campaignTemplateConcepts({ brand, draft, assets: [{ ...image, kind: "reference" }] });
    expect(referencesOnly.some((concept) => concept.id === "product-hero")).toBe(false);
    const withImage = campaignTemplateConcepts({ brand, draft, assets: [image] });
    expect(withImage[0].id).toBe("product-hero");
    expect(new Set(withImage.map((concept) => concept.document.pages[0].nodes.find((node) => node.role === "headline")?.text)).size).toBe(3);
    expect(new Set(withImage.map((concept) => concept.message)).size).toBe(3);
    expect(withImage[0].document.pages[0].nodes.some((node) => node.type === "image" && node.assetId === "shot")).toBe(true);
    const catalogById = new Map(campaignTemplateCatalog({ brand, draft, assets: [image] }).map((concept) => [concept.id, concept]));
    for (const concept of withImage) expect(concept.document).toEqual(catalogById.get(concept.id)?.document);
  });

  it("bounds unbroken and long announcements while preserving the full approved message", () => {
    const message = "A".repeat(1900);
    const concepts = campaignTemplateConcepts({ brand, draft: { ...draft, updateDetails: message, cta: "Read the announcement ".repeat(10) } });
    for (const concept of concepts) {
      expect(concept.message.length).toBeLessThanOrEqual(2000);
      expect(concept.message).toContain(message);
      const page = concept.document.pages[0];
      expect(page.nodes.find((node) => node.role === "headline")!.text.length).toBeLessThanOrEqual(110);
      for (const node of page.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThanOrEqual(1080.5);
        expect(node.y + node.height).toBeLessThanOrEqual(1080.5);
      }
    }

    const noRoom = "B".repeat(1990);
    expect(campaignTemplateConcepts({ brand, draft: { ...draft, updateDetails: noRoom } }).map((concept) => concept.message)).toEqual([noRoom, noRoom, noRoom]);
  });
});
