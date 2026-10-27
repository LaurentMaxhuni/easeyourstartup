import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CampaignConcepts, type CampaignConcept } from "@/components/studio/campaign-concepts";
import { emptyDesignDocument } from "@/lib/design-studio/document";

function concept(id: string, name: string, status: CampaignConcept["status"] = "ready"): CampaignConcept {
  const document = emptyDesignDocument();
  document.title = `${name} poster`;
  return { id, name, message: `${name} message`, status, designId: `design-${id}`, document };
}

function renderConcepts(input: Partial<React.ComponentProps<typeof CampaignConcepts>> = {}) {
  return renderToStaticMarkup(<CampaignConcepts
    concepts={[concept("launch", "Launch story"), concept("proof", "Customer proof"), concept("feature", "Feature spotlight")]}
    selectedId="proof"
    loading={false}
    stale={false}
    onEdit={vi.fn()}
    onSelect={vi.fn()}
    onRetry={vi.fn()}
    onBack={vi.fn()}
    onContinue={vi.fn()}
    {...input}
  />);
}

describe("CampaignConcepts", () => {
  it("renders each editable document preview with an accessible selection and edit control", () => {
    const markup = renderConcepts();

    expect(markup.match(/role="img"/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Preview of Launch story poster"');
    expect(markup).toContain('aria-label="Preview of Customer proof poster"');
    expect(markup).toContain('aria-label="Preview of Feature spotlight poster"');
    expect(markup).toContain('aria-label="Selected Customer proof"');
    expect(markup).toContain('aria-label="Edit concept: Customer proof"');
    expect(markup).toContain('name="campaign-concept"');
    expect(markup).toMatch(/<input id="proof-select"[^>]*checked=""/);
    expect(markup).toContain("Customer proof message");
    expect(markup).toContain("Generate posts");
  });

  it("keeps completed previews visible and locks their controls while announcing loading, stale, and failure states", () => {
    const markup = renderConcepts({
    concepts: [concept("ready", "Ready concept"), { id: "pending", name: "Pending concept", status: "generating" }, concept("failed", "Failed concept", "error")],
      selectedId: "ready",
      loading: true,
      error: "Two concepts could not be created.",
    notice: "Visual style analysis is unavailable. You can still edit these concepts.",
      stale: true,
    });

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Two concepts could not be created.");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Visual style analysis is unavailable. You can still edit these concepts.");
    expect(markup).toContain("Your brief or brand details changed");
    expect(markup).toContain("Continuing pairs its visual with your current announcement");
    expect(markup).toContain("Creating concepts");
    const readyRadio = markup.match(/<input id="ready-select"[^>]*>/)?.[0];
    expect(readyRadio).toContain('checked=""');
    expect(readyRadio).toContain("disabled=");
    expect(markup).toMatch(/<input id="pending-select"[^>]*disabled=""/);
    const failedRadio = markup.match(/<input id="failed-select"[^>]*>/)?.[0];
    expect(failedRadio).toBeDefined();
    expect(failedRadio).toContain("disabled=");
  });

  it("allows visual alternatives after generation without promising copy changes", () => {
    const markup = renderConcepts({ campaignGenerated: true, selectedId: "proof" });
    const selectedRadio = markup.match(/<input id="proof-select"[^>]*>/)?.[0];

    expect(selectedRadio).toContain('checked=""');
    expect(selectedRadio).not.toContain("disabled=");
    expect(markup).toMatch(/<button[^>]*aria-label="Edit concept: Customer proof"[^>]*>Edit concept<\/button>/);
    expect(markup).toContain("Use this concept in your campaign");
    expect(markup).toContain("saved channel copy stays unchanged");
    expect(markup).not.toContain("Generate posts");
  });

  it("locks generated and partial cards while a retryable job could overwrite their documents", () => {
    const markup = renderConcepts({
      concepts: [concept("current", "Current concept", "generating"), concept("partial", "Partial concept", "partial")],
      selectedId: "current",
      loading: false,
    });

    for (const id of ["current", "partial"]) {
      expect(markup.match(new RegExp(`<input id="${id}-select"[^>]*disabled=""`))).not.toBeNull();
      expect(markup.match(new RegExp(`<button[^>]*aria-label="Edit concept: ${id === "current" ? "Current concept" : "Partial concept"}"[^>]*disabled=""`))).not.toBeNull();
    }
    expect(markup).toContain("Partial result saved; retry to complete");
  });

  it("disables ready-card edits while generation is active", () => {
    const markup = renderConcepts({ loading: true });

    expect(markup.match(/<input id="proof-select"[^>]*disabled=""/)).not.toBeNull();
    expect(markup.match(/<button[^>]*aria-label="Edit concept: Customer proof"[^>]*disabled=""/)).not.toBeNull();
  });

  it("locks selection while a saved campaign job is pending and offers resume", () => {
    const markup = renderConcepts({ campaignJobPending: true });
    const selectedRadio = markup.match(/<input id="proof-select"[^>]*>/)?.[0];

    expect(selectedRadio).toContain("disabled=");
    expect(markup).toContain("Resume the saved campaign generation before changing concepts.");
    const resumeButton = markup.match(/<button[^>]*>Resume campaign generation<\/button>/)?.[0];
    expect(resumeButton).toBeDefined();
    expect(resumeButton).not.toContain("disabled=");
  });
});
