"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DesignPagePreview } from "@/components/design-studio/design-page-preview";
import { Button } from "@/components/ui/button";
import type { DesignDocument } from "@/lib/design-studio/document";

export type CampaignConceptStatus = "queued" | "generating" | "saving" | "partial" | "ready" | "error";
export type CampaignConcept = {
  id: string;
  name: string;
  document?: DesignDocument;
  designId?: string;
  revision?: number;
  message?: string;
  description?: string;
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
  campaignJobPending?: boolean;
  onEdit: (id: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onRefreshTemplates: () => void;
  onGenerateAi: () => void;
  templateLibrary: CampaignConcept[];
  onBrowseTemplates: () => void;
  onChooseTemplate: (id: string) => void;
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
  campaignJobPending = false,
  onEdit,
  onSelect,
  onRetry,
  onRefreshTemplates,
  onGenerateAi,
  templateLibrary,
  onBrowseTemplates,
  onChooseTemplate,
  onBack,
  onContinue,
}: CampaignConceptsProps) {
  const headingId = useId();
  const libraryHeadingId = useId();
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => {
    const dialog = libraryDialog.current;
    if (libraryOpen && dialog && !dialog.open) dialog.showModal();
    if (!libraryOpen && dialog?.open) dialog.close();
  }, [libraryOpen]);
  const selectedConcept = concepts.find((concept) => concept.id === selectedId);
  const selectedReady = Boolean(
    selectedConcept?.document?.pages[0] && selectedConcept.designId
      && selectedConcept.status !== "partial"
      && selectedConcept.status !== "generating"
      && selectedConcept.status !== "queued"
      && selectedConcept.status !== "saving",
  );
  const saving = concepts.some((concept) => concept.status === "saving");
  const failedCount = concepts.filter((concept) => concept.status === "error").length;
  const errorMessage = error || (failedCount > 0
    ? `${failedCount} concept ${failedCount === 1 ? "update failed" : "updates failed"}. Completed previews remain available.`
    : "");

  return (
    <section aria-labelledby={headingId} aria-busy={loading || saving} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Create your posts</p>
      <h1 id={headingId} className="mt-3 text-balance text-3xl font-semibold sm:text-4xl">Choose a post concept</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Three designs matched to your brand and announcement. Choose your favorite, or make it your own in the editor.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        {concepts[0]?.document && <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Your brand</span>
          {[...new Set([concepts[0].document.brand.primary, concepts[0].document.brand.secondary, concepts[0].document.brand.background])].map((color) => (
            <span key={color} title={color} aria-label={`Brand color ${color}`} className="size-5 rounded-full border border-line" style={{ background: color }} />
          ))}
          <span className="ml-1">{[...new Set([concepts[0].document.brand.headingFont, concepts[0].document.brand.bodyFont])].join(" + ")}</span>
        </div>}
        <Button type="button" variant="secondary" disabled={campaignJobPending} onClick={() => { onBrowseTemplates(); setLibraryOpen(true); }}>Browse all templates</Button>
      </div>

      <dialog ref={libraryDialog} aria-labelledby={libraryHeadingId} onCancel={() => setLibraryOpen(false)} onClose={() => setLibraryOpen(false)} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto rounded-container border border-line bg-canvas p-5 text-ink shadow-xl backdrop:bg-black/50 sm:p-7">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-canvas pb-4">
          <div><h2 id={libraryHeadingId} className="text-xl font-semibold">All templates</h2><p className="mt-1 text-sm text-muted">Every layout, using your brand and announcement.</p></div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setLibraryOpen(false)}>Close templates</Button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {templateLibrary.map((template) => {
            const document = template.document;
            const page = document?.pages[0];
            return document && page ? <article key={template.id} className="min-w-0 rounded-container border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold">{template.name}</h3>
              <div className="overflow-hidden rounded-control"><DesignPagePreview page={page} assets={document.assets} label={`Preview of ${document.title}`} /></div>
              <p className="mt-3 min-h-10 text-xs leading-5 text-muted">{template.description}</p>
              <Button type="button" variant="secondary" className="mt-3 w-full" aria-label={`Use template: ${template.name}`} onClick={() => { onChooseTemplate(template.id); setLibraryOpen(false); }}>Use this template</Button>
            </article> : null;
          })}
        </div>
      </dialog>

      {loading && (
        <p role="status" className="mt-5 rounded-control border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
          Creating custom AI concepts. You can keep editing or continue with any ready design.
        </p>
      )}

      {notice && <p role="status" className="mt-4 rounded-control border border-line bg-surface-raised px-4 py-3 text-sm text-muted">{notice}</p>}
      {campaignJobPending && (
        <p role="status" className="mt-4 rounded-control border border-line bg-surface-raised px-4 py-3 text-sm text-muted">
          Campaign generation is already running from the saved concept selection. Resume it before switching concepts.
        </p>
      )}

      {stale && (
        <div role="status" className="mt-4 flex flex-col gap-3 rounded-control border border-accent/30 bg-accent/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Your brief or brand details changed. These concepts may be out of date; your edits are still available.</p>
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving || campaignJobPending} onClick={onRefreshTemplates} className="shrink-0">
            Refresh templates
          </Button>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-control border border-danger/30 bg-surface p-4 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <p>{errorMessage}</p>
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving || campaignJobPending} onClick={onRetry} className="shrink-0">
            Retry
          </Button>
        </div>
      )}

      <fieldset className="mt-7 min-w-0">
        <legend className="sr-only">Choose one concept</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {concepts.map((concept, index) => {
            const page = concept.document?.pages[0];
            const ready = Boolean(page);
            const editable = ready && Boolean(concept.designId) && concept.status !== "partial" && concept.status !== "generating" && concept.status !== "queued" && concept.status !== "saving";
            const selectable = ready && (Boolean(concept.designId) || concept.id.startsWith("template-")) && concept.status !== "partial" && concept.status !== "generating" && concept.status !== "queued";
            const selected = selectedId === concept.id;
            const pending = concept.status === "queued" || concept.status === "generating" || (!page && concept.status !== "error" && concept.status !== "partial");
            const previewStatus = concept.status === "saving" ? "Saving template"
              : concept.status === "partial"
              ? page ? "Partial result saved; retry to complete" : "Partial preview unavailable"
              : concept.status === "error"
              ? page ? concept.designId ? "Last saved preview" : "Preview not saved" : "Preview unavailable"
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

                <button type="button" aria-label={`Choose preview: ${concept.name}`} disabled={!selectable || campaignJobPending} onClick={() => onSelect(concept.id)} className="mt-4 block w-full overflow-hidden rounded-control border border-line bg-canvas text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{preview}</button>
                {concept.description && <p className="mt-3 text-xs leading-5 text-muted">{concept.description}</p>}

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
                  <label htmlFor={`${concept.id}-select`} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control px-1 text-sm font-semibold ${selectable ? "" : "cursor-not-allowed opacity-60"}`}>
                    <input
                      id={`${concept.id}-select`}
                      type="radio"
                      name="campaign-concept"
                      value={concept.id}
                      aria-label={`${selected ? "Selected" : "Choose"} ${concept.name}`}
                      checked={selected}
                      disabled={!selectable || campaignJobPending}
                      onChange={() => onSelect(concept.id)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="sr-only">Select {concept.name}</span>
                    {selected ? "Selected" : "Choose"}
                  </label>
                  <Button type="button" variant="secondary" size="sm" aria-label={`Edit concept: ${concept.name}`} disabled={!editable || campaignJobPending} onClick={() => onEdit(concept.id)}>
                    Edit concept
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col gap-4 rounded-container border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Have another direction in mind?</p>
          <p className="mt-1 text-sm leading-5 text-muted">Let AI create custom alternatives. Your saved designs stay available.</p>
        </div>
        <Button type="button" variant="secondary" disabled={loading || saving || campaignJobPending} onClick={onGenerateAi} className="shrink-0">
          {loading ? "Creating with AI…" : "Create with AI"}
        </Button>
      </div>

      <div className="sticky bottom-0 z-20 mt-10 flex flex-col gap-3 border-t border-line bg-canvas/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="shrink-0 whitespace-nowrap">Back to announcement</Button>
        <div className="flex min-w-0 flex-col-reverse gap-3 sm:flex-1 sm:flex-row sm:items-center">
          <p aria-live="polite" className="min-w-0 text-center text-xs leading-5 text-muted sm:flex-1 sm:text-right">
            {campaignJobPending
              ? "Resume the saved campaign generation before changing concepts."
              : campaignGenerated
              ? "Changing concepts updates the visual; saved channel copy stays unchanged."
              : stale && selectedReady
                ? "This saved concept may reflect an older brief. Continuing pairs its visual with your current announcement; regenerate to match the new brief."
                : stale
                  ? "Saved concepts may reflect an older brief. Regenerate before continuing to match the current announcement."
                  : selectedReady
                ? `${selectedConcept?.name} selected. You can edit it or choose another.`
                : "Choose a ready concept to continue."}
          </p>
          <Button type="button" onClick={onContinue} disabled={!selectedReady && !campaignJobPending} size="lg" className="w-full shrink-0 whitespace-nowrap sm:w-auto">
            {campaignJobPending ? "Resume campaign generation" : campaignGenerated ? "Use this concept in your campaign" : "Generate posts"}
          </Button>
        </div>
      </div>
    </section>
  );
}
