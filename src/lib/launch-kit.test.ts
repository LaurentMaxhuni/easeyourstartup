import { describe, expect, it } from "vitest";
import {
  buildLaunchKitFiles,
  getLaunchKitReadiness,
} from "@/lib/launch-kit";
import {
  DEMO_BRAND,
  DEMO_OUTPUTS,
  DEMO_SCAN,
} from "@/lib/demo-data";

const draft = {
  kind: "feature_update" as const,
  goal: "Help solo founders turn a shipped update into a launch campaign.",
  updateDetails: "The launch-kit export now packages copy and evidence together.",
  audience: "Solo SaaS founders",
  launchDate: "2026-09-04",
  cta: "Build your launch campaign",
  angle: {
    id: "ship-to-campaign",
    title: "From ship to campaign",
    summary: "Make every product update worth announcing.",
  },
  channels: ["x", "linkedin", "product_hunt"] as const,
};

describe("launch kit", () => {
  it("packages separate channel copy and curated source evidence", () => {
    const files = buildLaunchKitFiles({
      brand: {
        ...DEMO_BRAND,
        claims: [
          ...DEMO_BRAND.claims,
          {
            id: "rejected-claim",
            text: "This must never enter the customer launch kit.",
            sourceUrl: "https://demo.easeyourstartup.com/rejected",
            sourceExcerpt: "Rejected evidence.",
            confidence: 0.1,
            approvalState: "rejected",
          },
        ],
      },
      draft,
      outputs: DEMO_OUTPUTS,
      scan: DEMO_SCAN,
    });

    expect(files.map((file) => file.path)).toEqual([
      "README.md",
      "brief.md",
      "copy/01-x.md",
      "copy/02-linkedin.md",
      "copy/03-product-hunt.md",
      "sources/source-facts.md",
      "campaign.json",
    ]);
    expect(files.find((file) => file.path === "copy/01-x.md")?.contents).toContain(
      "Shipping the feature is only half the job.",
    );
    expect(files.find((file) => file.path === "sources/source-facts.md")?.contents).toContain(
      "https://demo.easeyourstartup.com/product",
    );
    expect(files.map((file) => file.contents).join("\n")).not.toContain(
      "This must never enter the customer launch kit.",
    );
  });

  it("flags missing source evidence and unresolved copy warnings before export", () => {
    const readiness = getLaunchKitReadiness({
      brand: { ...DEMO_BRAND, claims: [] },
      draft,
      outputs: [
        {
          ...DEMO_OUTPUTS[0],
          warnings: ["The benefit claim needs founder review."],
        },
      ],
      scan: {
        ...DEMO_SCAN,
        readiness: [
          {
            category: "missing_proof",
            severity: "action",
            title: "Add customer proof",
            detail: "No customer result is available on the site.",
          },
        ],
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.approvedClaimCount).toBe(0);
    expect(readiness.warnings).toEqual([
      "No source-backed facts were kept for publishing.",
      "The benefit claim needs founder review.",
      "Add customer proof: No customer result is available on the site.",
    ]);
  });
});
