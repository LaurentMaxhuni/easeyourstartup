import { describe, expect, it } from "vitest";
import { DEMO_ANGLES, DEMO_BRAND, DEMO_COMPOSITION, DEMO_SCAN } from "@/lib/demo-data";
import { studioStateSchema } from "@/lib/contracts";

describe("studio state contract", () => {
  it("accepts an in-progress studio snapshot", () => {
    const state = studioStateSchema.parse({
      step: "brand",
      scan: DEMO_SCAN,
      brand: DEMO_BRAND,
      draft: {
        kind: "feature_update",
        goal: "",
        updateDetails: "",
        audience: "Solo founders",
        launchDate: "",
        cta: "Try it",
        angle: DEMO_ANGLES[0],
        channels: [],
      },
      generation: null,
      selectedCreativeId: "",
      outputs: [],
      composition: DEMO_COMPOSITION,
    });

    expect(state.step).toBe("brand");
    expect(state.draft.channels).toEqual([]);
    expect(state.designJobId).toBeNull();
    expect(state.concepts).toEqual([]);
    expect(state.previousConcepts).toEqual([]);
    expect(state.selectedConceptId).toBeNull();
    expect(state.conceptsSourceFingerprint).toBeNull();
  });

  it("loads persisted concept references without storing documents or preview data", () => {
    const designId = "11111111-1111-4111-8111-111111111111";
    const jobId = "22222222-2222-4222-8222-222222222222";
    const state = studioStateSchema.parse({
      step: "concepts",
      projectId: "33333333-3333-4333-8333-333333333333",
      campaignId: null,
      designJobId: jobId,
      concepts: [{
        id: "editorial",
        label: "Founder story",
        message: "Announce the new launch workflow.",
        description: "An editorial post grounded in the product update.",
        designId,
        designRevision: 4,
        document: { pages: [{ nodes: [{ text: "Do not persist document content" }] }] },
        previewDataUrl: "data:image/png;base64,preview-data",
      }],
      previousConcepts: [{
        id: "prior-editorial",
        label: "Earlier founder story",
        message: "Previously approved launch message.",
        designId: "44444444-4444-4444-8444-444444444444",
        designRevision: 7,
      }],
      selectedConceptId: "editorial",
      conceptsSourceFingerprint: "1234567890abcdef",
      scan: DEMO_SCAN,
      brand: DEMO_BRAND,
      draft: {
        kind: "feature_update",
        goal: "Announce the launch workflow",
        updateDetails: "The launch studio helps founders prepare product campaigns.",
        audience: "Solo founders",
        launchDate: "",
        cta: "Try it",
        angle: DEMO_ANGLES[0],
        channels: [],
      },
      generation: null,
      selectedCreativeId: "",
      outputs: [],
      composition: DEMO_COMPOSITION,
      design: null,
    });

    expect(state).toMatchObject({
      designJobId: jobId,
      concepts: [{ id: "editorial", designId, designRevision: 4 }],
      previousConcepts: [{ id: "prior-editorial", designRevision: 7 }],
      selectedConceptId: "editorial",
      conceptsSourceFingerprint: "1234567890abcdef",
    });
    expect(state.concepts[0]).not.toHaveProperty("document");
    expect(state.concepts[0]).not.toHaveProperty("previewDataUrl");
  });

  it("rejects an unknown workflow step", () => {
    expect(() =>
      studioStateSchema.parse({
        step: "canvas",
        scan: null,
        brand: null,
        draft: {
          kind: "launch",
          goal: "",
          updateDetails: "",
          audience: "",
          launchDate: "",
          cta: "",
          angle: DEMO_ANGLES[0],
          channels: [],
        },
        generation: null,
        selectedCreativeId: "",
        outputs: [],
        composition: DEMO_COMPOSITION,
      }),
    ).toThrow();
  });
});
