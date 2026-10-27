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

  it("keeps completed concepts available while announcing loading, stale, and failure states", () => {
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
    expect(markup).toContain("Creating concepts");
    expect(markup).toMatch(/<input id="ready-select"[^>]*checked=""/);
    expect(markup).toMatch(/<input id="pending-select"[^>]*disabled=""/);
    const failedRadio = markup.match(/<input id="failed-select"[^>]*>/)?.[0];
    expect(failedRadio).toBeDefined();
    expect(failedRadio).not.toContain("disabled=");
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
});
