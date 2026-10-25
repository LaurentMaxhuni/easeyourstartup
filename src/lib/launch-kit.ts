import type {
  BrandClaim,
  BrandProfile,
  Channel,
  ChannelOutput,
  NarrativeAngle,
  ScanResult,
  StudioDraft,
} from "@/lib/contracts";
import { CHANNEL_LABELS } from "@/lib/channels";
import type { DesignDocument } from "@/lib/design-studio/document";

export type LaunchKitFile = {
  path: string;
  contents: string;
};

type LaunchKitDraft = Pick<
  StudioDraft,
  "kind" | "goal" | "updateDetails" | "audience" | "launchDate" | "cta"
> & {
  angle: NarrativeAngle;
  channels: readonly Channel[];
};

export type LaunchKitInput = {
  brand: BrandProfile;
  draft: LaunchKitDraft;
  outputs: ChannelOutput[];
  // The saved visual; exports add one rendered PNG per slide under visual/.
  design?: DesignDocument | null;
  scan?: ScanResult | null;
};

export type LaunchKitReadiness = {
  ready: boolean;
  approvedClaimCount: number;
  outputCount: number;
  warnings: string[];
};

function approvedClaims(brand: BrandProfile) {
  return brand.claims.filter((claim) => claim.approvalState !== "rejected");
}

function orderedOutputs(input: LaunchKitInput) {
  const selected = new Map(input.outputs.map((output) => [output.channel, output]));
  const ordered = input.draft.channels.flatMap((channel) => {
    const output = selected.get(channel);
    return output ? [output] : [];
  });
  const selectedChannels = new Set(input.draft.channels);
  return [
    ...ordered,
    ...input.outputs.filter((output) => !selectedChannels.has(output.channel)),
  ];
}

function sourceForClaim(claim: BrandClaim) {
  return `- ${claim.text}\n  - Source: ${claim.sourceUrl}\n  - Evidence: ${claim.sourceExcerpt}`;
}

function copyFile(output: ChannelOutput, claimsById: Map<string, BrandClaim>) {
  const evidence = output.linkedClaimIds
    .map((id) => claimsById.get(id))
    .filter((claim): claim is BrandClaim => Boolean(claim));
  const missingEvidence = output.linkedClaimIds.filter((id) => !claimsById.has(id));
  const sections = [
    `# ${CHANNEL_LABELS[output.channel]}`,
    "",
    "## Primary copy",
    "",
    output.primaryCopy.trim(),
  ];

  if (output.alternateHooks.length > 0) {
    sections.push("", "## Alternate hooks", "", ...output.alternateHooks.map((hook) => `- ${hook}`));
  }
  if (output.cta) sections.push("", "## CTA", "", output.cta);
  if (output.hashtags.length > 0) sections.push("", "## Hashtags", "", output.hashtags.join(" "));
  if (evidence.length > 0) {
    sections.push(
      "",
      "## Source evidence",
      "",
      ...evidence.map(sourceForClaim),
    );
  }
  if (missingEvidence.length > 0 || output.warnings.length > 0) {
    sections.push("", "## Review before publishing", "");
    if (missingEvidence.length > 0) {
      sections.push(
        `- ${missingEvidence.length} linked claim${missingEvidence.length === 1 ? "" : "s"} is not available in the kept source facts.`,
      );
    }
    sections.push(...output.warnings.map((warning) => `- ${warning}`));
  }
  return `${sections.join("\n").trim()}\n`;
}

function briefFile(input: LaunchKitInput) {
  const { brand, draft } = input;
  return [
    `# ${brand.projectName} launch brief`,
    "",
    `**Campaign type:** ${draft.kind.replaceAll("_", " ")}`,
    `**Launch date:** ${draft.launchDate || "Not scheduled"}`,
    `**Audience:** ${draft.audience}`,
    `**Goal:** ${draft.goal}`,
    `**CTA:** ${draft.cta}`,
    "",
    "## Narrative angle",
    "",
    `**${draft.angle.title}** — ${draft.angle.summary}`,
    "",
    "## Update",
    "",
    draft.updateDetails,
    "",
  ].join("\n");
}

function readmeFile(input: LaunchKitInput, files: LaunchKitFile[]) {
  return [
    `# ${input.brand.projectName} launch kit`,
    "",
    "This package is ready for a final founder review before publishing. The copy is editable; the source file lists only facts the automatic curation pass kept for public use.",
    "",
    "## Publish in this order",
    "",
    "1. Read `brief.md` to confirm the audience, update, angle, and CTA.",
    "2. Review every file in `copy/` and resolve any `Review before publishing` notes.",
    "3. Use `sources/source-facts.md` when you need to verify a factual statement.",
    "4. Use the PNG files in `visual/` as the accompanying images, in slide order.",
    "",
    "## Contents",
    "",
    ...files.map((file) => `- \`${file.path}\``),
    "- `visual/*.png` (rendered slides, included during export)",
    "",
  ].join("\n");
}

export function getLaunchKitReadiness(input: LaunchKitInput): LaunchKitReadiness {
  const warnings = [
    ...input.outputs.flatMap((output) => output.warnings),
    ...(input.scan?.readiness
      .filter((finding) => finding.severity === "action")
      .map((finding) => `${finding.title}: ${finding.detail}`) ?? []),
  ];
  const approvedClaimCount = approvedClaims(input.brand).length;
  if (input.outputs.length === 0) warnings.unshift("Generate at least one channel output before exporting.");
  if (approvedClaimCount === 0) warnings.unshift("No source-backed facts were kept for publishing.");
  return {
    ready: input.outputs.length > 0 && approvedClaimCount > 0 && warnings.length === 0,
    approvedClaimCount,
    outputCount: input.outputs.length,
    warnings: [...new Set(warnings)],
  };
}

export function buildLaunchKitFiles(input: LaunchKitInput): LaunchKitFile[] {
  const claims = approvedClaims(input.brand);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const files: LaunchKitFile[] = [
    { path: "brief.md", contents: briefFile(input) },
    ...orderedOutputs(input).map((output, index) => ({
      path: `copy/${String(index + 1).padStart(2, "0")}-${output.channel.replaceAll("_", "-")}.md`,
      contents: copyFile(output, claimsById),
    })),
    {
      path: "sources/source-facts.md",
      contents: [
        "# Kept public source facts",
        "",
        "Only these source-backed facts passed automatic curation for public launch copy.",
        "",
        ...(claims.length > 0
          ? claims.map(sourceForClaim)
          : ["No website facts were kept for this launch."]),
        "",
      ].join("\n"),
    },
    {
      path: "campaign.json",
      contents: `${JSON.stringify(
        {
          brand: { ...input.brand, claims },
          draft: input.draft,
          outputs: input.outputs,
          visual: input.design ? { title: input.design.title, slides: input.design.pages.map((page) => ({ name: page.name, width: page.width, height: page.height })) } : null,
          sourcePages: input.scan?.pages ?? [],
          readiness: getLaunchKitReadiness(input),
        },
        null,
        2,
      )}\n`,
    },
    ...(input.design ? [{ path: "visual/design.json", contents: `${JSON.stringify(input.design, null, 2)}\n` }] : []),
  ];
  return [{ path: "README.md", contents: readmeFile(input, files) }, ...files];
}
