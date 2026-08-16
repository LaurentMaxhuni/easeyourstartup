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
