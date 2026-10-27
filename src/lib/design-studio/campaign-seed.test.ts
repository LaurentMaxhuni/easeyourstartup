import { describe, expect, it } from "vitest";
import { DEMO_SCAN } from "@/lib/demo-data";
import { campaignBrandKit, campaignDesignDocument, conceptCampaignDetails, shortBrandName } from "./campaign-seed";

const brand = DEMO_SCAN.profile;
const imageAsset = { id: "shot", name: "Website", kind: "image" as const, description: "", dataUrl: "data:image/png;base64,iVBORw0KGgo=" };

describe("campaign design seed", () => {
  it("carries edited concept text into the campaign without losing the announcement", () => {
    const document = campaignDesignDocument({ brand });
    const headline = document.pages[0].nodes.find((node) => node.role === "headline" && node.type === "text")!;
    headline.text = "A founder's edited headline";
    const result = conceptCampaignDetails("Our new feature is ready.", document, "Focus on the founder's time saved");
    expect(result).toContain("Our new feature is ready.");
    expect(result).toContain("A founder's edited headline");
    expect(result).toContain("Focus on the founder's time saved");
    expect(result.length).toBeLessThanOrEqual(2000);
  });
  it("maps the scanned brand onto a valid kit, falling back to Outfit for unknown fonts", () => {
    const kit = campaignBrandKit({ ...brand, fonts: ["Unknown Grotesk"], visualSystem: brand.visualSystem && { ...brand.visualSystem, headingFont: "Fraunces, serif", bodyFont: "Mystery" } });
    expect(kit.name).toBe(shortBrandName(brand.projectName));
    expect(kit.headingFont).toBe(brand.visualSystem ? "Fraunces" : "Outfit");
    expect(kit.bodyFont).toBe("Outfit");
    expect(kit.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("builds one editable page carrying the campaign's own headline and CTA", () => {
    const document = campaignDesignDocument({
      brand,
      direction: { id: "d1", eyebrow: "New", headline: "Ship launches in minutes", subheadline: "From one website scan", body: "", cta: "Try it free", footer: "" } as never,
    });
    expect(document.pages).toHaveLength(1);
    const text = document.pages[0].nodes.filter((node) => node.type === "text").map((node) => node.text).join(" ");
    expect(text).toContain("Ship launches in minutes");
    expect(text.toLowerCase()).toContain("try it free");
  });

  it("features the website screenshot when one is supplied", () => {
    const document = campaignDesignDocument({ brand, assets: [imageAsset] });
    expect(document.pages[0].nodes.some((node) => node.type === "image" && node.assetId === "shot")).toBe(true);
  });

  it("keeps only the name from tagline-style page titles", () => {
    expect(shortBrandName("Laurent Maxhuni — Full-Stack Developer & AI Builder")).toBe("Laurent Maxhuni");
    expect(shortBrandName("Linear | Plan and build products")).toBe("Linear");
    expect(shortBrandName("Cal.com - Scheduling infrastructure")).toBe("Cal.com");
    expect(shortBrandName("Notion")).toBe("Notion");
  });
});
