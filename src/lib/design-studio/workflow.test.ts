import { describe, expect, it } from "vitest";
import { alternativeLayoutCount, generationInputSchema } from "./workflow";

describe("generation copy options", () => {
  it("keeps shared copy as the default and accepts distinct concept copy when requested", () => {
    const base = { action: "generate", prompt: "Announce our new integration", brand: {}, variants: 3 };
    expect(generationInputSchema.parse(base).distinctCopyPerDirection).toBe(false);
    expect(generationInputSchema.parse({ ...base, distinctCopyPerDirection: true }).distinctCopyPerDirection).toBe(true);
  });
});

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
