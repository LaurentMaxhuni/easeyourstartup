import { describe, expect, it } from "vitest";
import {
  brandIntelligenceSchema,
  brandProfileSchema,
  creativeCompositionSchema,
  creativeDesignResultSchema,
  generateJobResultSchema,
  generateCampaignSchema,
  scanJobResultSchema,
  studioStateSchema,
} from "@/lib/contracts";
import {
  DEMO_ANGLES,
  DEMO_BRAND,
  DEMO_COMPOSITION,
  DEMO_OUTPUTS,
  DEMO_SCAN,
} from "@/lib/demo-data";

describe("application contracts", () => {
  it("accepts saved brand profiles created before brand intelligence fields", () => {
    expect(brandProfileSchema.parse(DEMO_BRAND)).toEqual(DEMO_BRAND);
  });

  it("validates structured brand interpretation separately from claims", () => {
    const intelligence = brandIntelligenceSchema.parse({
      productPurpose: "Launch planning workspace for small teams.",
      audience: "Small product teams",
      painPoints: ["Launch planning is scattered."],
      benefits: ["Keeps launch tasks in one place."],
      differentiators: ["Built around product launches."],
      tone: ["clear", "direct"],
      visualStyle: ["airy page spacing", "Gradient accents"],
      unsupportedClaimsToAvoid: ["Guaranteed launch growth."],
    });

    expect(intelligence).not.toHaveProperty("claims");
  });

  it("validates a versioned creative composition", () => {
    expect(creativeCompositionSchema.parse(DEMO_COMPOSITION)).toEqual(
      DEMO_COMPOSITION,
    );
  });

  it("rejects oversized render dimensions", () => {
    expect(() =>
      creativeCompositionSchema.parse({
        ...DEMO_COMPOSITION,
        output: { width: 10000, height: 10000 },
      }),
    ).toThrow();
  });

  it("requires at least one channel", () => {
    expect(() =>
      generateCampaignSchema.parse({
        brand: DEMO_BRAND,
        kind: "launch",
        goal: "Launch to the first ten founder beta users",
        updateDetails: "The launch campaign studio is now available.",
        audience: "Solo SaaS founders",
        launchDate: "",
        cta: "Try it",
        angle: DEMO_ANGLES[0],
        channels: [],
      }),
    ).toThrow();
  });

  it("validates a normalized design with a theme and verified image asset", () => {
    const result = creativeDesignResultSchema.parse({
      theme: {
        background: DEMO_COMPOSITION.tokens.background,
        foreground: DEMO_COMPOSITION.tokens.foreground,
        accent: DEMO_COMPOSITION.tokens.accent,
        headingFontFamily: "Outfit",
        bodyFontFamily: "Outfit",
      },
      elements: [
        {
          id: "design-image",
          kind: "image",
          x: 54,
          y: 12,
          width: 38,
          height: 64,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          src: DEMO_COMPOSITION.screenshotUrl,
          alt: "Product screenshot",
          radius: 8,
        },
        {
          id: "design-headline",
          kind: "text",
          x: 8,
          y: 20,
          width: 42,
          height: 24,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          textRole: "headline",
          text: "A designed launch story",
          color: DEMO_COMPOSITION.tokens.foreground,
          fontSize: 5,
          fontWeight: 650,
          align: "left",
          radius: 0,
        },
      ],
    });

    expect(result.elements[0]).toHaveProperty("src", DEMO_COMPOSITION.screenshotUrl);
    expect(result.elements[0].kind).toBe("image");
    expect(result).not.toHaveProperty("tokens");
    expect(result).not.toHaveProperty("text");
  });

  it("accepts rich visual layers without executable model code", () => {
    const result = creativeDesignResultSchema.parse({
      theme: {
        background: DEMO_COMPOSITION.tokens.background,
        foreground: DEMO_COMPOSITION.tokens.foreground,
        accent: DEMO_COMPOSITION.tokens.accent,
        headingFontFamily: "Outfit",
        bodyFontFamily: "Outfit",
      },
      elements: [
        {
          id: "gradient-background",
          kind: "gradient",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          gradientFrom: "#101828",
          gradientTo: "#245cf0",
          gradientAngle: 135,
          effect: "drift",
          effectTrigger: "always",
        },
        {
          id: "target-icon",
          kind: "icon",
          x: 78,
          y: 10,
          width: 10,
          height: 10,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          icon: "target",
          color: "#f4f3ef",
          effect: "pulse",
          effectTrigger: "hover",
        },
      ],
    });

    expect(result.elements.map((element) => element.kind)).toEqual([
      "gradient",
      "icon",
    ]);
    expect(result.elements[0]).not.toHaveProperty("html");
    expect(result.elements[0]).not.toHaveProperty("script");
  });

  it("keeps AI design provenance without storing raw generated code", () => {
    const composition = creativeCompositionSchema.parse({
      ...DEMO_COMPOSITION,
      designSource: "ai",
      codeBundle: {
        html: "<main>legacy code</main>",
        css: "main { color: red; }",
        javascript: "alert(1)",
      },
    });

    expect(composition.designSource).toBe("ai");
    expect(composition).not.toHaveProperty("codeBundle");
  });

  it("validates a completed durable scan result", () => {
    expect(scanJobResultSchema.parse({ scan: DEMO_SCAN }).scan.profile.projectName).toBe(
      "EaseYourStartup",
    );
  });

  it("validates the full durable campaign result needed by the studio", () => {
    const result = generateJobResultSchema.parse({
      generation: {
        angles: DEMO_ANGLES,
        outputs: DEMO_OUTPUTS,
        creativeDirections: [
          {
            id: "demo-creative",
            label: "Product proof",
            layout: "browser",
            icon: "rocket-launch",
            graphic: "orbit",
            imageMode: "single",
            eyebrow: "EaseYourStartup",
            headline: "Turn every ship into a campaign.",
            subheadline: "Launch the product update you already shipped.",
            body: "Source-backed copy and real screenshots in one package.",
            cta: "Build your launch",
            footer: "Source-backed launch studio",
          },
        ],
        mode: "ai",
      },
    });

    expect(result.generation.outputs).toHaveLength(3);
  });

  it("keeps existing saved studios compatible while adding a durable project id", () => {
    const state = studioStateSchema.parse({
      step: "brand",
      scan: DEMO_SCAN,
      brand: DEMO_BRAND,
      draft: {
        kind: "launch",
        goal: "Prepare the first launch campaign for solo SaaS founders.",
        updateDetails: "The launch studio is ready for founder beta users.",
        audience: "Solo SaaS founders",
        launchDate: "",
        cta: "Build your launch campaign",
        angle: DEMO_ANGLES[0],
        channels: ["x"],
      },
      generation: null,
      selectedCreativeId: "",
      outputs: [],
      composition: DEMO_COMPOSITION,
    });

    expect(state.projectId).toBeNull();
  });
});
