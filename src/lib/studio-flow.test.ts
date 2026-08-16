import { describe, expect, it } from "vitest";
import {
  getStudioProgress,
  STUDIO_STAGES,
} from "@/lib/studio-flow";

describe("studio flow", () => {
  it("uses plain-language stages and reports progress", () => {
    expect(STUDIO_STAGES.map((stage) => stage.label)).toEqual([
      "Source",
      "Facts",
      "Brief",
      "Posts",
    ]);
    expect(getStudioProgress("campaign")).toEqual({
      current: 3,
      total: 4,
      percent: 75,
    });
  });
});
