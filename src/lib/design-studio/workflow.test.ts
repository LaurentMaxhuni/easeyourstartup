import { describe, expect, it } from "vitest";
import { alternativeLayoutCount } from "./workflow";
describe("conversational alternative layouts", () => {
  it.each([
    ["Generate three alternative layouts.", 3],
    ["Show me two different directions", 2],
    ["Create a new layout", 3],
    ["Keep everything but redesign the CTA", null],
    ["Move the headline 3 pixels higher", null],
  ])("routes %s to the requested variation count", (prompt, count) => {
    expect(alternativeLayoutCount(prompt)).toBe(count);
  });
});
