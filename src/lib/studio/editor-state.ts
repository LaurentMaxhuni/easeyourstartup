import type {
  CreativeComposition,
  CreativeDesignAsset,
  CreativeDesignResult,
  CreativeElement,
  CreativeTextRole,
} from "@/lib/contracts";

const TEXT_ELEMENT_DEFAULTS: Record<
  CreativeTextRole,
  Pick<CreativeElement, "x" | "y" | "width" | "height" | "fontSize">
> = {
  eyebrow: { x: 8, y: 7, width: 46, height: 6, fontSize: 1.45 },
  headline: { x: 8, y: 17, width: 48, height: 24, fontSize: 5.2 },
  subheadline: { x: 8, y: 44, width: 46, height: 12, fontSize: 2.05 },
  body: { x: 8, y: 58, width: 45, height: 14, fontSize: 1.32 },
  cta: { x: 8, y: 80, width: 25, height: 7, fontSize: 1.42 },
  footer: { x: 68, y: 88, width: 25, height: 5, fontSize: 0.92 },
};

function textElement(
  role: CreativeTextRole,
  text: string,
  color: string,
  composition: CreativeComposition,
): CreativeElement {
  const defaults = TEXT_ELEMENT_DEFAULTS[role];
  const centered = composition.templateId === "quote";
  return {
    id: `text-${role}`,
    kind: "text",
    ...defaults,
    x: centered ? 10 : defaults.x,
    width: centered ? 80 : defaults.width,
    y:
      centered && role === "headline"
        ? 20
        : centered && role === "subheadline"
          ? 51
          : defaults.y,
    height:
      centered && role === "headline"
        ? 25
        : centered && role === "subheadline"
          ? 10
          : defaults.height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    textRole: role,
    text,
    color,
    fontWeight:
      role === "headline" || role === "cta" ? 650 : role === "eyebrow" ? 600 : 450,
    align: centered ? "center" : role === "footer" ? "right" : "left",
    radius: role === "cta" ? composition.tokens.radius ?? 8 : 0,
    effect: role === "headline" ? "rise" : "none",
    effectTrigger: "always",
    shadow: role === "cta" ? "soft" : "none",
  };
}

function imageElement(
  id: string,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 8,
): CreativeElement {
  return {
    id,
    kind: "image",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    src,
    radius,
    effect: "float",
    effectTrigger: "always",
    shadow: "lift",
  };
}

function gradientElement(composition: CreativeComposition): CreativeElement {
  return {
    id: "gradient-background",
    kind: "gradient",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 0.9,
    locked: false,
    hidden: false,
    gradientFrom: composition.tokens.background,
    gradientTo: composition.tokens.accent,
    gradientAngle: composition.templateId === "editorial" ? 160 : 135,
    effect: "none",
    effectTrigger: "always",
    shadow: "none",
    radius: 0,
  };
}

function shapeElement(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: "rectangle" | "circle" | "line",
  composition: CreativeComposition,
  rotation = 0,
): CreativeElement {
  return {
    id,
    kind: "shape",
    x,
    y,
    width,
    height,
    rotation,
    opacity: shape === "line" ? 0.58 : 0.14,
    locked: false,
    hidden: false,
    shape,
    fill: composition.tokens.foreground,
    radius:
      shape === "circle"
        ? 50
        : shape === "line"
          ? 0
          : composition.tokens.radius ?? 8,
    effect: "none",
    effectTrigger: "always",
    shadow: shape === "line" ? "none" : "soft",
  };
}

function iconElement(composition: CreativeComposition): CreativeElement {
  return {
    id: "icon-accent",
    kind: "icon",
    x: 84,
    y: 8,
    width: 8,
    height: 8,
    rotation: 8,
    opacity: 1,
    locked: false,
    hidden: false,
    icon: composition.icon,
    color: composition.tokens.accent,
    fill: composition.tokens.foreground,
    radius: 50,
    effect: "pulse",
    effectTrigger: "hover",
    shadow: "glow",
  };
}

function createRichSingleImageElements(
  composition: CreativeComposition,
  textElements: CreativeElement[],
) {
  const image =
    composition.templateId === "editorial" || composition.templateId === "launch-card"
      ? imageElement(
          "image-main",
          composition.screenshotUrl,
          composition.templateId === "editorial" ? 36 : 35,
          composition.templateId === "editorial" ? 64 : 68,
          60,
          composition.templateId === "editorial" ? 27 : 23,
          12,
        )
      : imageElement(
          "image-main",
          composition.screenshotUrl,
          composition.templateId === "phone" ? 58 : 57,
          composition.templateId === "phone" ? 18 : 17,
          composition.templateId === "phone" ? 32 : 36,
          composition.templateId === "phone" ? 59 : 58,
          composition.templateId === "phone" ? 16 : 10,
        );
  const panel =
    composition.templateId === "editorial" || composition.templateId === "launch-card"
      ? shapeElement(
          "shape-image-panel",
          composition.templateId === "editorial" ? 33 : 5,
          composition.templateId === "editorial" ? 61 : 6,
          composition.templateId === "editorial" ? 64 : 90,
          composition.templateId === "editorial" ? 32 : 88,
          "rectangle",
          composition,
          composition.templateId === "editorial" ? -2 : 0,
        )
      : shapeElement(
          "shape-image-panel",
          composition.templateId === "phone" ? 54 : 53,
          composition.templateId === "phone" ? 15 : 14,
          composition.templateId === "phone" ? 39 : 42,
          composition.templateId === "phone" ? 65 : 64,
          "rectangle",
          composition,
          composition.templateId === "phone" ? 3 : -3,
        );
  const accent =
    composition.templateId === "editorial" || composition.templateId === "launch-card"
      ? shapeElement(
          "shape-accent",
          75,
          10,
          18,
          18,
          "circle",
          composition,
          12,
        )
      : shapeElement(
          "shape-rule",
          7,
          composition.templateId === "phone" ? 72 : 72,
          28,
          0.5,
          "line",
          composition,
        );
  return [
    ...(composition.tokens.usesGradient ? [gradientElement(composition)] : []),
    panel,
    accent,
    image,
    iconElement(composition),
    ...textElements,
  ];
}

export function createDefaultEditorElements(
  composition: CreativeComposition,
): CreativeElement[] {
  const textColor = composition.tokens.foreground;
  const textElements = [
    textElement("eyebrow", composition.text.eyebrow, textColor, composition),
    textElement("headline", composition.text.headline, textColor, composition),
    textElement(
      "subheadline",
      composition.text.subheadline,
      textColor,
      composition,
    ),
    textElement("body", composition.text.body, textColor, composition),
    textElement("cta", composition.text.cta, composition.tokens.accent, composition),
    textElement("footer", composition.text.footer, textColor, composition),
  ];

  if (composition.imageMode === "devices") {
    return [
      ...(composition.tokens.usesGradient ? [gradientElement(composition)] : []),
      shapeElement("shape-device-panel", 49, 30, 47, 42, "rectangle", composition, -3),
      shapeElement("shape-device-rule", 7, 67, 31, 0.5, "line", composition),
      imageElement(
        "image-desktop",
        composition.mockups.desktop,
        52,
        43,
        42,
        31,
        5,
      ),
      imageElement("image-tablet", composition.mockups.tablet, 62, 70, 20, 24, 7),
      imageElement("image-phone", composition.mockups.phone, 28, 70, 14, 24, 9),
      iconElement(composition),
      ...textElements,
    ];
  }

  return createRichSingleImageElements(composition, textElements);
}

export function getEditorElements(
  composition: CreativeComposition,
): CreativeElement[] {
  return composition.elements?.length
    ? composition.elements
    : createDefaultEditorElements(composition);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeEditorElements(
  elements: CreativeElement[],
): CreativeElement[] {
  const usedIds = new Set<string>();
  const uniqueId = (preferred: string) => {
    let candidate = preferred;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${preferred}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };

  return elements.map((element) => {
    const minimumWidth = 2;
    const minimumHeight =
      element.kind === "shape" && element.shape === "line" ? 0.4 : 2;
    const x = clamp(finiteOr(element.x, 0), 0, 100 - minimumWidth);
    const y = clamp(finiteOr(element.y, 0), 0, 100 - minimumHeight);
    const width = clamp(
      finiteOr(element.width, minimumWidth),
      minimumWidth,
      100 - x,
    );
    const height = clamp(
      finiteOr(element.height, minimumHeight),
      minimumHeight,
      100 - y,
    );

    return {
      ...element,
      id: uniqueId(element.id),
      x,
      y,
      width,
      height,
    };
  });
}

export function moveEditorElement(
  element: CreativeElement,
  deltaX: number,
  deltaY: number,
): CreativeElement {
  return {
    ...element,
    x: clamp(element.x + deltaX, 0, 100 - element.width),
    y: clamp(element.y + deltaY, 0, 100 - element.height),
  };
}

export function resizeEditorElement(
  element: CreativeElement,
  deltaWidth: number,
  deltaHeight: number,
): CreativeElement {
  return {
    ...element,
    width: clamp(element.width + deltaWidth, 2, 100 - element.x),
    height: clamp(element.height + deltaHeight, 2, 100 - element.y),
  };
}

export function duplicateEditorElement(
  element: CreativeElement,
  id: string,
): CreativeElement {
  return {
    ...element,
    id,
    x: clamp(element.x + 2, 0, 100 - element.width),
    y: clamp(element.y + 2, 0, 100 - element.height),
  };
}

export function updateEditorElement(
  elements: CreativeElement[],
  id: string,
  patch: Partial<CreativeElement>,
): CreativeElement[] {
  return elements.map((element) =>
    element.id === id ? { ...element, ...patch } : element,
  );
}

export function removeEditorElement(
  elements: CreativeElement[],
  id: string,
): CreativeElement[] {
  return elements.filter((element) => element.id !== id);
}

export function addEditorElement(
  elements: CreativeElement[],
  element: CreativeElement,
): CreativeElement[] {
  return [...elements, element];
}

export function reorderEditorElement(
  elements: CreativeElement[],
  id: string,
  direction: "forward" | "backward",
): CreativeElement[] {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return elements;
  const nextIndex = direction === "forward" ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= elements.length) return elements;
  const next = [...elements];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

export function syncCompositionText(
  composition: CreativeComposition,
  elements: CreativeElement[],
): CreativeComposition {
  const text = { ...composition.text };
  for (const element of elements) {
    if (element.kind === "text" && element.textRole && element.text !== undefined) {
      text[element.textRole] = element.text;
    }
  }
  return { ...composition, elements, text };
}

export function applyCreativeDesign(
  composition: CreativeComposition,
  design: CreativeDesignResult,
): CreativeComposition {
  const assetSources: Record<CreativeDesignAsset, string> = {
    primary: composition.screenshotUrl,
    desktop: composition.mockups.desktop,
    tablet: composition.mockups.tablet,
    phone: composition.mockups.phone,
  };

  const elements = normalizeEditorElements(
    design.elements.map(({ asset, ...element }) => ({
      ...element,
      ...(element.kind === "image"
        ? { src: assetSources[asset ?? "primary"] ?? composition.screenshotUrl }
        : {}),
    })),
  );

  return syncCompositionText(
    {
      ...composition,
      templateId: design.templateId,
      imageMode: design.imageMode,
      screenshotCrop: design.screenshotCrop,
      tokens: design.tokens,
      text: design.text,
      icon: design.icon,
      graphic: design.graphic,
    },
    elements,
  );
}
