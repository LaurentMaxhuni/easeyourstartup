"use client";

import { useId } from "react";
import { DesignPagePreview } from "@/components/design-studio/design-page-preview";
import { Button } from "@/components/ui/button";
import type { DesignDocument } from "@/lib/design-studio/document";

export type CampaignConceptStatus = "queued" | "generating" | "ready" | "error";
export type CampaignConcept = {
  id: string;
  name: string;
  document?: DesignDocument;
  designId?: string;
  revision?: number;
  message?: string;
  status?: CampaignConceptStatus;
};

export type CampaignConceptsProps = {
  concepts: CampaignConcept[];
  selectedId: string | null;
  loading: boolean;
  error?: string | null;
  notice?: string | null;
  stale: boolean;
  campaignGenerated?: boolean;
  onEdit: (id: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export function CampaignConcepts({
  concepts,
  selectedId,
  loading,
  error,
  notice,
  stale,
  campaignGenerated = false,
  onEdit,
  onSelect,
  onRetry,
  onBack,
  onContinue,
}: CampaignConceptsProps) {
  const headingId = useId();
  const selectedConcept = concepts.find((concept) => concept.id === selectedId);
  const selectedReady = Boolean(selectedConcept?.document?.pages[0]);
  const failedCount = concepts.filter((concept) => concept.status === "error").length;
  const errorMessage = error || (failedCount > 0
    ? `${failedCount} concept ${failedCount === 1 ? "update failed" : "updates failed"}. Completed previews remain available.`
    : "");

  return (
    <section aria-labelledby={headingId} aria-busy={loading} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Create your posts</p>
      <h1 id={headingId} className="mt-3 text-balance text-3xl font-semibold sm:text-4xl">Choose a post concept</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Compare three editable designs. Choose one to shape the rest of your campaign, or edit any concept first.
      </p>

      {loading && (
        <p role="status" className="mt-5 rounded-control border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
          Creating concepts. Completed previews remain available while the others finish.
        </p>
      )}

      {notice && <p role="status" className="mt-4 rounded-control border border-line bg-surface-raised px-4 py-3 text-sm text-muted">{notice}</p>}

      {stale && (
        <div role="status" className="mt-4 flex flex-col gap-3 rounded-control border border-accent/30 bg-accent/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Your brief or brand details changed. These concepts may be out of date; your edits are still available.</p>
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={onRetry} className="shrink-0">
            Regenerate concepts
          </Button>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-control border border-danger/30 bg-surface p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <p>{errorMessage}</p>
          <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={onRetry} className="shrink-0">
            Retry concepts
          </Button>
        </div>
      )}

      <fieldset className="mt-7">
        <legend className="sr-only">Choose one concept</legend>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {concepts.map((concept, index) => {
            const page = concept.document?.pages[0];
            const ready = Boolean(page);
            const selected = selectedId === concept.id;
            const pending = concept.status === "queued" || concept.status === "generating" || (!page && concept.status !== "error");
            const previewStatus = concept.status === "error"
              ? page ? "Last saved preview" : "Preview unavailable"
              : pending && page
                ? "Saved preview while updating"
                : pending
                ? concept.status === "queued" ? "Waiting to create preview" : "Creating preview"
                : ready
                  ? "Ready to edit"
                  : "Preview unavailable";
            const preview = concept.document && page
              ? <DesignPagePreview page={page} assets={concept.document.assets} label={`Preview of ${concept.document.title}`} />
              : <div aria-hidden="true" className="grid aspect-[4/5] place-items-center bg-surface-raised px-5 text-center text-sm text-muted">
                <span>{pending ? "Your preview is being prepared…" : "No preview available"}</span>
              </div>;

            return (
              <article key={concept.id} aria-labelledby={`${concept.id}-title`} className={`rounded-container border bg-surface p-4 transition-colors sm:p-5 ${selected ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-line"}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Concept {index + 1}</p>
                    <h2 id={`${concept.id}-title`} className="mt-1 truncate text-base font-semibold">{concept.name}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${selected ? "bg-accent/10 text-accent" : "bg-surface-raised text-muted"}`}>
                    {selected ? "Selected" : previewStatus}
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-control border border-line bg-canvas">{preview}</div>

                {concept.message && (
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Post message</p>
                    <p className="mt-1 line-clamp-4 text-sm leading-5">{concept.message}</p>
                  </div>
                )}

                <p className={`mt-3 text-xs ${concept.status === "error" ? "text-danger" : "text-muted"}`}>
                  {previewStatus}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <label htmlFor={`${concept.id}-select`} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control px-1 text-sm font-semibold ${ready ? "" : "cursor-not-allowed opacity-60"}`}>
                    <input
                      id={`${concept.id}-select`}
                      type="radio"
                      name="campaign-concept"
                      value={concept.id}
                      aria-label={`${selected ? "Selected" : "Choose"} ${concept.name}`}
                      checked={selected}
                      disabled={!ready}
                      onChange={() => onSelect(concept.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="sr-only">Select {concept.name}</span>
                    {selected ? "Selected" : "Choose"}
                  </label>
                  <Button type="button" variant="secondary" size="sm" aria-label={`Edit concept: ${concept.name}`} disabled={!ready} onClick={() => onEdit(concept.id)}>
                    Edit concept
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </fieldset>

      <div className="sticky bottom-0 z-20 mt-10 flex flex-col gap-3 border-t border-line bg-canvas/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="shrink-0 whitespace-nowrap">Back to announcement</Button>
        <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-1 sm:flex-row sm:items-center">
          <p aria-live="polite" className="min-w-0 text-center text-xs leading-5 text-muted sm:flex-1 sm:text-right">
            {campaignGenerated
              ? "Changing concepts updates the visual; saved channel copy stays unchanged."
              : selectedReady
                ? `${selectedConcept?.name} selected. You can edit it or choose another.`
                : "Choose a ready concept to continue."}
          </p>
          <Button type="button" onClick={onContinue} disabled={!selectedReady || loading} size="lg" className="w-full shrink-0 whitespace-nowrap sm:w-auto">
            {campaignGenerated ? "Use this concept in your campaign" : "Generate posts"}
          </Button>
        </div>
      </div>
    </section>
  );
}
