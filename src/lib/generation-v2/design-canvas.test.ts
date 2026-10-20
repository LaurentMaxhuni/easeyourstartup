import { describe, expect, it } from "vitest";
import { resolveGeneratedCreativeDesign } from "./design-canvas";
import type { CreativeDesignResult } from "@/lib/contracts";

describe("generated campaign canvas", () => {
  it("preserves AI-authored geometry without substituting a fixed composition", () => {
    const design: CreativeDesignResult = {
      theme: { background: "#ffffff", foreground: "#111827", accent: "#245cf0", headingFontFamily: "Outfit", bodyFontFamily: "Outfit" },
      elements: [{ id: "headline", kind: "text", textRole: "headline", text: "Custom campaign", x: 34, y: 62, width: 58, height: 23, rotation: -4, opacity: 1, locked: false, hidden: false }],
    };
    expect(resolveGeneratedCreativeDesign({ creativeDesign: design })).toBe(design);
  });

  it("does not fabricate a canvas from a legacy V2 copy plan", () => {
    expect(resolveGeneratedCreativeDesign({ generationV2: { designPlan: { components: [{ headline: "Reviewed wording" }] } } })).toBeNull();
    expect(resolveGeneratedCreativeDesign({})).toBeNull();
  });
});
