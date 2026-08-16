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
