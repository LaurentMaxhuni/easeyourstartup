import type { CreativeComposition } from "@/lib/contracts";

export function compositionImageUrls(composition: CreativeComposition): string[] {
  if (composition.designSource === "ai" || composition.elements?.length) {
    return (composition.elements ?? []).flatMap((element) => element.kind === "image" && element.src ? [element.src] : []);
  }
  return composition.imageMode === "devices"
    ? Object.values(composition.mockups)
    : [composition.screenshotUrl];
}

export function toExportableImageUrl(
  source: string | null | undefined,
  fallback: string,
) {
  if (!source) return fallback;
  if (
    source.startsWith("data:") ||
    source.startsWith("blob:") ||
    (source.startsWith("/") && !source.startsWith("//"))
  ) {
    return source;
  }
  return `/api/image-proxy?url=${encodeURIComponent(source)}`;
}
