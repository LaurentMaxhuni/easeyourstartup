import { describe, expect, it } from "vitest";
import {
  creativeCodeBundleSchema,
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

  it("validates a whole-canvas design response without allowing model URLs", () => {
    const result = creativeDesignResultSchema.parse({
      templateId: "split",
      imageMode: "single",
      screenshotCrop: DEMO_COMPOSITION.screenshotCrop,
      tokens: DEMO_COMPOSITION.tokens,
      text: DEMO_COMPOSITION.text,
      icon: "target",
      graphic: "grid",
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
          asset: "primary",
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

    expect(result.elements[0]).not.toHaveProperty("src");
    expect(result.elements[0].kind).toBe("image");
  });

  it("accepts rich visual layers without executable model code", () => {
    const result = creativeDesignResultSchema.parse({
      templateId: "split",
      imageMode: "single",
      screenshotCrop: DEMO_COMPOSITION.screenshotCrop,
      tokens: DEMO_COMPOSITION.tokens,
      text: DEMO_COMPOSITION.text,
      icon: "target",
      graphic: "none",
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

  it("keeps generated HTML, CSS, and JavaScript in a bounded code bundle", () => {
    const code = creativeCodeBundleSchema.parse({
      html: '<main data-launch-preview><h1>Ship with confidence</h1></main>',
      css: "main { color: #f4f3ef; }",
      javascript:
        'const preview = document.querySelector("[data-launch-preview]");',
    });

    const composition = creativeCompositionSchema.parse({
      ...DEMO_COMPOSITION,
      codeBundle: code,
    });

    expect(composition.codeBundle).toEqual(code);
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
