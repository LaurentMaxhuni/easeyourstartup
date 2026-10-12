import { describe, expect, it } from "vitest";
import { generationOrbState, type GenerationScreenStage } from "./generation-progress";

describe("generation orb activity", () => {
  it.each(["preparing", "queued", "writing", "visuals"] as GenerationScreenStage[])("changes shape while %s remains active", (stage) => {
    expect(generationOrbState(stage, 0)).toBe(generationOrbState(stage, 3));
    expect(generationOrbState(stage, 4)).not.toBe(generationOrbState(stage, 0));
  });
  it("changes immediately when copy moves to visuals", () => {
    expect(generationOrbState("writing", 0)).toBe("composing");
    expect(generationOrbState("visuals", 0)).toBe("shaping");
  });
});
