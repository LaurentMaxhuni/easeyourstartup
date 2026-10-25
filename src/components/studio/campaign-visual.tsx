"use client";

import { useEffect, useState } from "react";
import { DesignPagePreview } from "@/components/design-studio/design-page-preview";
import { CampaignLoader } from "@/components/ui/campaign-loader";
import { Button } from "@/components/ui/button";
import { designDocumentSchema, type DesignDocument } from "@/lib/design-studio/document";

export type CampaignDesignRef = { id: string; revision: number };

// The posts page view of the campaign's saved design.
export function CampaignVisual({
  design,
  status,
  error,
  watermarked,
  onEdit,
  onRetry,
}: {
  design: CampaignDesignRef | null;
  status: "idle" | "creating" | "error";
  error: string;
  watermarked: boolean;
  onEdit: () => void;
  onRetry: () => void;
}) {
  const key = design ? `${design.id}:${design.revision}` : null;
  const [loaded, setLoaded] = useState<{ key: string; document: DesignDocument | null; error?: string } | null>(null);
  const document = loaded?.key === key ? loaded.document : null;
  const loadError = loaded?.key === key ? loaded.error : undefined;

  useEffect(() => {
    if (!design || !key) return;
    const controller = new AbortController();
    fetch(`/api/design-studio?designId=${encodeURIComponent(design.id)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { design?: { document?: unknown }; error?: string };
        if (!response.ok) throw new Error(data.error || "Your visual could not be loaded.");
        setLoaded({ key, document: designDocumentSchema.parse(data.design?.document) });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, document: null, error: failure instanceof Error ? failure.message : "Your visual could not be loaded." });
      });
    return () => controller.abort();
  }, [design, key]);

  const page = document?.pages[0];
  const message = status === "error" ? error : loadError;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="matching-visual-title" className="text-xl font-semibold">Your visual</h2>
        <Button variant="secondary" size="sm" onClick={onEdit} disabled={!design}>Edit visual</Button>
      </div>
      <p className="mt-1 text-xs text-muted">A matching image to share alongside your post.</p>
      <div className="relative mt-4 overflow-hidden rounded-container border border-line bg-surface">
        {page && document ? (
          <>
            <DesignPagePreview page={page} assets={document.assets} label={`Preview of ${document.title}`} />
            {watermarked && <span className="absolute bottom-3 right-4 rounded bg-white/90 px-3 py-1 text-sm text-black">Made with EaseYourStartup</span>}
          </>
        ) : (
          <div className="grid aspect-square place-items-center p-6 text-center">
            {message ? (
              <div>
                <p role="alert" className="text-sm text-danger">{message}</p>
                {status === "error" && <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
              </div>
            ) : (
              <div role="status" className="flex flex-col items-center gap-3">
                <CampaignLoader activity="visuals" />
                <span className="text-xs text-muted">{status === "creating" ? "Designing your visual…" : "Loading your visual…"}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {document && document.pages.length > 1 && <p className="mt-2 text-xs text-muted">{document.pages.length} slides · Download all posts includes every slide.</p>}
    </>
  );
}
