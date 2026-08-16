import type { CreativeElement } from "@/lib/contracts";

export function creativeLayerEffectClass(element: CreativeElement) {
  if (!element.effect || element.effect === "none") return undefined;
  const effectClass = `creative-layer-effect-${element.effect}`;
  if (element.effectTrigger === "hover") {
    return `creative-layer-effect-hover ${effectClass}`;
  }
  if (element.effectTrigger === "click") {
    return `creative-layer-effect-click ${effectClass}`;
  }
  return effectClass;
}

export function creativeLayerShadow(
  element: CreativeElement,
  accent: string,
) {
  if (element.shadow === "soft") {
    return "0 14px 34px rgba(15, 23, 42, 0.18)";
  }
  if (element.shadow === "lift") {
    return "0 20px 42px rgba(15, 23, 42, 0.26)";
  }
  if (element.shadow === "glow") {
    return `0 0 28px ${accent}66`;
  }
  return undefined;
}
