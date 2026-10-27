export function capturePreviewUrl(source: string | null, projectId: string | null): string | null {
  if (!source?.startsWith("/api/capture?")) return source;
  const params = new URLSearchParams(source.slice("/api/capture?".length));
  params.set("preview", "1");
  if (projectId) params.set("projectId", projectId);
  return `/api/capture?${params}`;
}
