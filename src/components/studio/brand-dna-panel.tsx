"use client";

import {
  Check,
  LinkSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Image from "next/image";
import { StudioActionBar } from "@/components/studio/studio-action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BrandProfile, ScanResult } from "@/lib/contracts";
import { toExportableImageUrl } from "@/lib/studio-export";
import { cn } from "@/lib/utils";

export function BrandDnaPanel({
  scan,
  brand,
  onChange,
  onClaimsApproved,
  onBack,
  onContinue,
}: {
  scan: ScanResult;
  brand: BrandProfile;
  onChange: (brand: BrandProfile) => void;
  onClaimsApproved?: (approvedClaimCount: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const approvedCount = brand.claims.filter(
    (claim) => claim.approvalState === "approved",
  ).length;

  function updateClaim(
    id: string,
    approvalState: "approved" | "rejected",
  ) {
    const nextClaims = brand.claims.map((claim) =>
      claim.id === id ? { ...claim, approvalState } : claim,
    );
    onChange({
      ...brand,
      claims: nextClaims,
    });
    const previous = brand.claims.find((claim) => claim.id === id);
    if (approvalState === "approved" && previous?.approvalState !== "approved") {
      onClaimsApproved?.(
        nextClaims.filter((claim) => claim.approvalState === "approved").length,
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-col justify-between gap-5 border-b border-line pb-8 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{scan.mode === "demo" ? "Demo scan" : "Live scan"}</Badge>
            <Badge>{scan.pages.length} source pages</Badge>
            <Badge>
              {approvedCount}/{brand.claims.length} facts approved
            </Badge>
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            Check what we found
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Confirm the brand details and approve only the facts you want to use
            in public copy.
          </p>
        </div>
      </div>

      {scan.warnings.length > 0 && (
        <div className="mt-6 rounded-container border border-line bg-surface p-4">
          {scan.warnings.map((warning) => (
            <p
              key={warning}
              className="flex gap-2 text-xs leading-5 text-muted"
            >
              <WarningCircle className="mt-0.5 shrink-0" size={15} />
              {warning}
            </p>
          ))}
        </div>
      )}

      <section className="mt-6" aria-labelledby="readiness-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="readiness-title" className="text-lg font-semibold">
              What the scan found
            </h2>
            <p className="mt-1 text-xs text-muted">
              Fix the items marked action before you publish.
            </p>
          </div>
        </div>
        <div className="mt-4 border-y border-line">
          {scan.readiness.map((finding) => (
            <div
              key={finding.category}
              className="grid gap-2 border-b border-line py-4 last:border-b-0 sm:grid-cols-[120px_200px_1fr] sm:items-start"
            >
              <Badge
                className={
                  finding.severity === "action"
                    ? "border-danger/30 text-danger"
                    : finding.severity === "good"
                      ? "border-accent/30 text-accent"
                      : undefined
                }
              >
                {finding.severity}
              </Badge>
              <p className="text-sm font-semibold">{finding.title}</p>
              <p className="text-xs leading-5 text-muted">{finding.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
        <section
          aria-labelledby="identity-title"
          className="rounded-container border border-line bg-surface-raised p-5 sm:p-6"
        >
          <h2 id="identity-title" className="text-lg font-semibold">
            Brand details
          </h2>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-xs font-semibold">Project name</span>
              <Input
                className="mt-2"
                value={brand.projectName}
                onChange={(event) =>
                  onChange({ ...brand, projectName: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold">Positioning</span>
              <Textarea
                className="mt-2"
                value={brand.tagline}
                onChange={(event) =>
                  onChange({ ...brand, tagline: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold">Audience</span>
              <Textarea
                className="mt-2 min-h-24"
                value={brand.audience}
                onChange={(event) =>
                  onChange({ ...brand, audience: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold">
                Voice, separated by commas
              </span>
              <Input
                className="mt-2"
                value={brand.voice.join(", ")}
                onChange={(event) =>
                  onChange({
                    ...brand,
                    voice: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 6),
                  })
                }
              />
            </label>
            <div>
              <span className="text-xs font-semibold">Extracted palette</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {brand.colors.map((color, index) => (
                  <label
                    key={`${color}-${index}`}
                    className="flex items-center gap-2 rounded-control border border-line bg-canvas p-2"
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => {
                        const colors = [...brand.colors];
                        colors[index] = event.target.value;
                        onChange({ ...brand, colors });
                      }}
                      className="size-7 cursor-pointer rounded border-0 bg-transparent"
                      aria-label={`Brand color ${index + 1}`}
                    />
                    <span className="font-sans text-[10px] uppercase">
                      {color}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {brand.imageUrl && (
              <div>
                <span className="text-xs font-semibold">Source image</span>
                <a
                  href={brand.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block overflow-hidden rounded-control border border-line bg-canvas"
                >
                  <Image
                    src={toExportableImageUrl(
                      brand.imageUrl,
                      "/images/studio-capture.png",
                    )}
                    alt="Primary image extracted from the website"
                    width={640}
                    height={360}
                    unoptimized
                    className="aspect-video w-full object-cover"
                  />
                </a>
                <p className="mt-2 text-xs leading-5 text-muted">
                  This image will be used in the visual studio unless a live
                  browser capture is available.
                </p>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="claims-title">
          <div className="flex items-center justify-between">
            <h2 id="claims-title" className="text-lg font-semibold">
              Public claims
            </h2>
            <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-muted">
              {approvedCount} approved for copy
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {brand.claims.length === 0 && (
              <div className="rounded-container border border-line bg-surface-raised p-6">
                <p className="font-semibold">No reliable claims were extracted.</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  You can still generate from the update details you enter. The
                  output will warn that it contains no approved website claim.
                </p>
              </div>
            )}
            {brand.claims.map((claim) => (
              <article
                key={claim.id}
                className={cn(
                  "rounded-container border bg-surface-raised p-5 transition-colors",
                  claim.approvalState === "approved"
                    ? "border-accent/50"
                    : "border-line",
                  claim.approvalState === "rejected" && "opacity-55",
                )}
              >
                <p className="text-sm font-semibold leading-6">{claim.text}</p>
                <blockquote className="mt-3 border-l-2 border-line pl-3 text-xs leading-5 text-muted">
                  {claim.sourceExcerpt}
                </blockquote>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <a
                    href={claim.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-sm items-center gap-1.5 truncate text-xs font-medium text-accent"
                  >
                    <LinkSimple className="shrink-0" size={14} />
                    <span className="truncate">
                      {new URL(claim.sourceUrl).hostname}
                    </span>
                  </a>
                  <div className="flex gap-2">
                    <Button
                      variant={
                        claim.approvalState === "rejected"
                          ? "secondary"
                          : "ghost"
                      }
                      size="sm"
                      onClick={() => updateClaim(claim.id, "rejected")}
                    >
                      <X size={15} />
                      Exclude
                    </Button>
                    <Button
                      variant={
                        claim.approvalState === "approved"
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      onClick={() => updateClaim(claim.id, "approved")}
                    >
                      <Check size={15} weight="bold" />
                      Approve
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <StudioActionBar
        backLabel="Change source"
        onBack={onBack}
        nextLabel="Continue to brief"
        onNext={onContinue}
        helper={
          brand.claims.length === 0
            ? "No approved facts yet. Your brief can still use the update you enter."
            : approvedCount + " facts will be available to the campaign."
        }
      />
    </div>
  );
}
