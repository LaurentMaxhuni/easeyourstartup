import { describe, expect, it } from "vitest";
import { DEMO_ANGLES, DEMO_BRAND, DEMO_COMPOSITION, DEMO_SCAN } from "@/lib/demo-data";
import { studioStateSchema } from "@/lib/contracts";
import {
  appendStudioConceptsToHistory,
  areStudioConceptsFromJob,
  areStudioConceptsStale,
  getStudioConceptsSourceFingerprint,
  updateStudioConceptRevision,
} from "@/lib/studio/concepts";

function makeStudioState() {
  return studioStateSchema.parse({
    step: "campaign",
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
  });
}

const concept = {
  id: "editorial",
  label: "Founder story",
  message: "Announce the new launch workflow.",
  description: "An editorial post grounded in the product update.",
  designId: "11111111-1111-4111-8111-111111111111",
  designRevision: 2,
};

describe("studio concepts state", () => {
  it("fingerprints source inputs deterministically and notices brief, brand, and asset changes", () => {
    const state = makeStudioState();
    const fingerprint = getStudioConceptsSourceFingerprint(state);

    expect(getStudioConceptsSourceFingerprint(state)).toBe(fingerprint);
    expect(getStudioConceptsSourceFingerprint({
      ...state,
      draft: { ...state.draft, updateDetails: "A different announcement." },
    })).not.toBe(fingerprint);
    expect(getStudioConceptsSourceFingerprint({
      ...state,
      brand: { ...state.brand!, colors: ["#123456"] },
    })).not.toBe(fingerprint);
    expect(getStudioConceptsSourceFingerprint({
      ...state,
      scan: { ...state.scan!, desktopCaptureUrl: "https://example.com/new-capture.png" },
    })).not.toBe(fingerprint);
  });

  it("marks saved or running concept work stale when its source changes", () => {
    const state = makeStudioState();
    const fingerprint = getStudioConceptsSourceFingerprint(state);
    const jobId = "22222222-2222-4222-8222-222222222222";
    const saved = studioStateSchema.parse({
      ...state,
      designJobId: jobId,
      concepts: [{ ...concept, id: "concept-22222222-editorial-abc" }],
      conceptsSourceFingerprint: fingerprint,
    });

    expect(areStudioConceptsStale(state, fingerprint)).toBe(false);
    expect(areStudioConceptsStale(saved, fingerprint)).toBe(false);
    expect(areStudioConceptsStale(saved, `${fingerprint}changed`)).toBe(true);
    expect(areStudioConceptsStale({ ...saved, conceptsSourceFingerprint: null }, fingerprint)).toBe(true);
  });

  it("keeps older saved directions stale during a replacement job even after its new fingerprint is stored", () => {
    const state = makeStudioState();
    const fingerprint = getStudioConceptsSourceFingerprint(state);
    const jobId = "22222222-2222-4222-8222-222222222222";
    const replacement = { ...concept, id: "concept-22222222-direction-abc" };
    const running = studioStateSchema.parse({
      ...state,
      designJobId: jobId,
      concepts: [concept],
      conceptsSourceFingerprint: fingerprint,
    });

    expect(areStudioConceptsFromJob([replacement], jobId)).toBe(true);
    expect(areStudioConceptsFromJob([concept], jobId)).toBe(false);
    expect(areStudioConceptsStale(running, fingerprint)).toBe(true);
    expect(areStudioConceptsStale({ ...running, concepts: [replacement] }, fingerprint)).toBe(false);
  });

  it("advances the matching saved design revision and ignores stale or unrelated callbacks", () => {
    const state = studioStateSchema.parse({ ...makeStudioState(), concepts: [concept] });
    const advanced = updateStudioConceptRevision(state, concept.id, concept.designId, 3);

    expect(advanced.concepts[0].designRevision).toBe(3);
    expect(updateStudioConceptRevision(advanced, concept.id, concept.designId, 2)).toBe(advanced);
    expect(updateStudioConceptRevision(advanced, "missing", concept.designId, 4)).toBe(advanced);
    expect(updateStudioConceptRevision(advanced, concept.id, "33333333-3333-4333-8333-333333333333", 4)).toBe(advanced);
    expect(updateStudioConceptRevision(advanced, concept.id, concept.designId, 0)).toBe(advanced);
  });

  it("keeps current templates fresh while an optional AI job runs, without blessing templates from an older brief", () => {
    const state = makeStudioState();
    const fingerprint = getStudioConceptsSourceFingerprint(state);
    const current = {
      concepts: [{ ...concept, id: `template-${fingerprint}-swiss-grid` }],
      designJobId: "22222222-2222-4222-8222-222222222222",
      conceptsSourceFingerprint: fingerprint,
    };
    expect(areStudioConceptsStale(current, fingerprint)).toBe(false);
    expect(areStudioConceptsStale({ ...current, concepts: [{ ...concept, id: "template-older-swiss-grid" }] }, fingerprint)).toBe(true);
  });

  it("preserves concept references before replacement and refuses to exceed history capacity", () => {
    const previous = { ...concept, id: "prior-editorial", designRevision: 5 };
    const state = studioStateSchema.parse({
      ...makeStudioState(),
      concepts: [concept],
      previousConcepts: [previous],
    });

    expect(appendStudioConceptsToHistory(state)).toEqual([previous, concept]);
    const fullHistory = studioStateSchema.parse({
      ...makeStudioState(),
      concepts: [concept],
      previousConcepts: Array.from({ length: 9 }, (_, index) => ({
        ...concept,
        id: `prior-${index}`,
        designId: `0000000${index + 1}-1111-4111-8111-111111111111`,
      })),
    });
    expect(appendStudioConceptsToHistory(fullHistory)).toBeNull();
  });

  it("updates revisions for archived concepts as well as the current set", () => {
    const previous = { ...concept, id: "prior-editorial", designRevision: 5 };
    const state = studioStateSchema.parse({ ...makeStudioState(), previousConcepts: [previous] });
    const advanced = updateStudioConceptRevision(state, previous.id, previous.designId, 6);

    expect(advanced.previousConcepts[0].designRevision).toBe(6);
  });
});
