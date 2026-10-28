import { describe, expect, it } from "vitest";
import { DEMO_SCAN } from "@/lib/demo-data";
import { campaignBrandKit, campaignDesignDocument, campaignFontSubstitutions, conceptCampaignDetails, shortBrandName } from "./campaign-seed";

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
  it("maps supported scanned fonts and uses a predictable fallback for unknown fonts", () => {
    const kit = campaignBrandKit({ ...brand, fonts: ["Unknown Grotesk"], visualSystem: brand.visualSystem && { ...brand.visualSystem, headingFont: "Fraunces, serif", bodyFont: "Mystery" } });
    expect(kit.name).toBe(shortBrandName(brand.projectName));
    expect(kit.headingFont).toBe(brand.visualSystem ? "Fraunces" : "Outfit");
    expect(kit.bodyFont).toBe("Inter");
    expect(kit.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("maps visual color roles only when they remain in the edited palette", () => {
    const currentColors = ["#f8f4ec", "#d94327", "#18243a"];
    const staleVisual = {
      ...(brand.visualSystem ?? { radius: 8, spacing: 16, density: "comfortable" as const, usesGradient: false, backgroundColor: "#ffffff", foregroundColor: "#111111", accentColor: "#000000", headingFont: "Outfit", bodyFont: "Outfit" }),
      backgroundColor: "#ffffff", foregroundColor: "#101010", accentColor: "#00ff00",
    };
    const kit = campaignBrandKit({ ...brand, colors: currentColors, visualSystem: staleVisual });
    expect(kit.primary).toBe("#d94327");
    expect(kit.secondary).toBe("#18243a");
    expect(kit.background).toBe("#f8f4ec");

    const matchingVisual = { ...staleVisual, backgroundColor: "#f8f4ec", foregroundColor: "#18243a", accentColor: "#d94327" };
    const matched = campaignBrandKit({ ...brand, colors: currentColors, visualSystem: matchingVisual });
    expect([matched.primary, matched.secondary, matched.background]).toEqual(["#d94327", "#18243a", "#f8f4ec"]);

    const pinkPalette = ["#ffffff", "#111111", "#f02c65"];
    const pink = campaignBrandKit({ ...brand, colors: pinkPalette, visualSystem: { ...staleVisual, backgroundColor: "#ffffff", foregroundColor: "#111111", accentColor: "#00ff00" } });
    expect(pink.primary).toBe("#f02c65");
  });

  it("recognizes explicit Outfit and CSS family lists with variable aliases", () => {
    const kit = campaignBrandKit({
      ...brand,
      fonts: ["'Inter Variable', Arial, sans-serif", "Outfit var, sans-serif"],
      visualSystem: brand.visualSystem && { ...brand.visualSystem, headingFont: "Outfit Variable", bodyFont: "Inter var, Arial" },
    });
    expect(kit.headingFont).toBe("Outfit");
    expect(kit.bodyFont).toBe("Inter");

    const fallback = { ...brand, fonts: ["Acme Grotesk, Arial"], visualSystem: undefined };
    expect(campaignBrandKit(fallback).headingFont).toBe("Arial");
    expect(campaignFontSubstitutions(fallback)).toContain("Heading font Acme Grotesk → Arial.");
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

  it("keeps explicit Outfit on campaign text instead of substituting a template pairing", () => {
    const document = campaignDesignDocument({ brand: { ...brand, fonts: ["Outfit"], visualSystem: undefined } });
    const textNodes = document.pages[0].nodes.filter((node) => node.type === "text");
    expect(textNodes.length).toBeGreaterThan(0);
    expect(new Set(textNodes.map((node) => node.fontFamily))).toEqual(new Set(["Outfit"]));
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
