import { describe, expect, it } from "vitest";
import { creativeDesignResultSchema } from "@/lib/contracts";
import { DEMO_COMPOSITION } from "@/lib/demo-data";
import {
  applyCreativeDesign,
  createDefaultEditorElements,
  duplicateEditorElement,
  moveEditorElement,
  normalizeEditorElements,
  reorderEditorElement,
  resizeEditorElement,
  updateEditorElement,
} from "@/lib/studio/editor-state";

describe("mini Canva editor state", () => {
  it("creates a usable editable document from a composition", () => {
    const elements = createDefaultEditorElements(DEMO_COMPOSITION);

    expect(elements.some((element) => element.kind === "image")).toBe(true);
    expect(elements.some((element) => element.kind === "gradient")).toBe(false);
    expect(elements.some((element) => element.kind === "icon")).toBe(true);
    expect(elements.some((element) => element.kind === "shape")).toBe(true);
    expect(
      elements.find((element) => element.textRole === "headline")?.text,
    ).toBe(DEMO_COMPOSITION.text.headline);
    expect(elements.every((element) => element.x >= 0 && element.y >= 0)).toBe(
      true,
    );
  });

  it("moves an element without mutating the source and clamps the canvas", () => {
    const element = createDefaultEditorElements(DEMO_COMPOSITION).find(
      (item) => item.kind === "image",
    );
    if (!element) throw new Error("Expected an image element");
    const moved = moveEditorElement(element, 90, -30);

    expect(moved).not.toBe(element);
    expect(moved.x).toBe(100 - element.width);
    expect(moved.y).toBe(0);
    expect(element.x).not.toBe(moved.x);
  });

  it("resizes an element within the canvas bounds", () => {
    const element = createDefaultEditorElements(DEMO_COMPOSITION).find(
      (item) => item.kind === "image",
    );
    if (!element) throw new Error("Expected an image element");
    const resized = resizeEditorElement(element, 90, 90);

    expect(resized.width).toBe(100 - element.x);
    expect(resized.height).toBe(100 - element.y);
  });

  it("duplicates an element with a new id and a small offset", () => {
    const element = createDefaultEditorElements(DEMO_COMPOSITION).find(
      (item) => item.kind === "image",
    );
    if (!element) throw new Error("Expected an image element");
    const duplicate = duplicateEditorElement(element, "copy-1");

    expect(duplicate.id).toBe("copy-1");
    expect(duplicate.x).toBe(element.x + 2);
    expect(duplicate.y).toBe(element.y + 2);
    expect(element.id).not.toBe(duplicate.id);
  });

  it("updates only the requested element", () => {
    const elements = createDefaultEditorElements(DEMO_COMPOSITION);
    const headline = elements.find((element) => element.textRole === "headline");
    if (!headline) throw new Error("Expected a headline element");

    const updated = updateEditorElement(elements, headline.id, {
      text: "A new headline",
    });

    expect(updated.find((element) => element.id === headline.id)?.text).toBe(
      "A new headline",
    );
    expect(updated.filter((element) => element.id !== headline.id)).toEqual(
      elements.filter((element) => element.id !== headline.id),
    );
  });

  it("reorders layers without mutating the layer stack", () => {
    const elements = createDefaultEditorElements(DEMO_COMPOSITION);
    const firstId = elements[0].id;
    const secondId = elements[1].id;
    const reordered = reorderEditorElement(elements, firstId, "forward");

    expect(reordered.map((element) => element.id).slice(0, 2)).toEqual([
      secondId,
      firstId,
    ]);
    expect(elements[0].id).toBe(firstId);
  });

  it("normalizes AI layer geometry to the canvas bounds", () => {
    const source = createDefaultEditorElements(DEMO_COMPOSITION).find(
      (item) => item.kind === "image",
    );
    if (!source) throw new Error("Expected an image element");
    const [normalized, duplicate] = normalizeEditorElements([
      { ...source, x: 96, y: 96, width: 40, height: 40 },
      { ...source, x: 12, y: 12 },
    ]);

    expect(normalized.x + normalized.width).toBeLessThanOrEqual(100);
    expect(normalized.y + normalized.height).toBeLessThanOrEqual(100);
    expect(duplicate.id).not.toBe(normalized.id);
  });

  it("applies a structured AI design using only the composition assets", () => {
    const design = creativeDesignResultSchema.parse({
      templateId: "split",
      imageMode: "single",
      screenshotCrop: { ...DEMO_COMPOSITION.screenshotCrop, x: 22 },
      tokens: { ...DEMO_COMPOSITION.tokens, accent: "#e25b39" },
      text: { ...DEMO_COMPOSITION.text, headline: "A complete visual system" },
      icon: "target",
      graphic: "grid",
      elements: [
        {
          id: "ai-image",
          kind: "image",
          x: 90,
          y: 90,
          width: 30,
          height: 30,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          asset: "primary",
          radius: 8,
        },
        {
          id: "ai-headline",
          kind: "text",
          x: 8,
          y: 18,
          width: 46,
          height: 22,
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          textRole: "headline",
          text: "A complete visual system",
          color: DEMO_COMPOSITION.tokens.foreground,
          fontSize: 5,
          fontWeight: 650,
          align: "left",
          radius: 0,
        },
      ],
    });

    const applied = applyCreativeDesign(DEMO_COMPOSITION, design);
    const image = applied.elements?.find((element) => element.id === "ai-image");

    expect(applied).not.toBe(DEMO_COMPOSITION);
    expect(applied.tokens.accent).toBe("#e25b39");
    expect(applied.screenshotCrop.x).toBe(22);
    expect(image?.src).toBe(DEMO_COMPOSITION.screenshotUrl);
    expect((image?.x ?? 0) + (image?.width ?? 0)).toBeLessThanOrEqual(100);
    expect(applied.text.headline).toBe("A complete visual system");
  });
});
