import { describe, expect, it } from "vitest";
import { automaticCampaignTitles, shortCampaignTitle } from "./campaign-title";

describe("shortCampaignTitle", () => {
  it("uses the first sentence without its final punctuation", () => {
    expect(shortCampaignTitle("We added shared folders. Teams can now keep work together.")).toBe("We added shared folders");
  });

  it("cuts long text at a word boundary", () => {
    const title = shortCampaignTitle("Kitlane is a native desktop home for your software library with discovery, platform availability and sync");
    expect(title).toBe("Kitlane is a native desktop home for your software library with…");
    expect(title.length).toBeLessThanOrEqual(71);
  });

  it("collapses whitespace and line breaks", () => {
    expect(shortCampaignTitle("Your tools.\nAll together.")).toBe("Your tools");
  });

  it("names empty text", () => {
    expect(shortCampaignTitle("   ")).toBe("Untitled campaign");
  });
});

describe("automaticCampaignTitles", () => {
  it("covers the short title and the legacy 180-character title", () => {
    const details = "a".repeat(200);
    expect(automaticCampaignTitles(details)).toEqual([shortCampaignTitle(details), "a".repeat(180)]);
  });
});
