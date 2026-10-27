"use client";

import {
  ArrowClockwise,
  CheckCircle,
  LinkSimple,
  Palette,
  TextAa,
  WarningCircle,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { StudioActionBar } from "@/components/studio/studio-action-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BrandProfile, ScanResult } from "@/lib/contracts";
import { toExportableImageUrl } from "@/lib/studio-export";

export function BrandDnaPanel({
  scan,
  brand,
  onChange,
  onBack,
  onContinue,
  onRescan,
  rescanResetsWork = false,
}: {
  scan: ScanResult;
  brand: BrandProfile;
  onChange: (brand: BrandProfile) => void;
  onBack: () => void;
  onContinue: () => void;
  onRescan?: () => void;
  rescanResetsWork?: boolean;
}) {
  const [confirmingRescan, setConfirmingRescan] = useState(false);
  const approvedCount = brand.claims.filter(
    (claim) => claim.approvalState !== "rejected",
  ).length;
  const interpretationGroups = brand.brandIntelligence
    ? [
        { title: "Audience", items: [brand.brandIntelligence.audience] },
        { title: "Pain points", items: brand.brandIntelligence.painPoints },
        { title: "Benefits", items: brand.brandIntelligence.benefits },
        { title: "Differentiators", items: brand.brandIntelligence.differentiators },
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-col justify-between gap-5 border-b border-line pb-8 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{scan.pages.length} pages read</Badge>
            <Badge>
              {approvedCount} product facts found
            </Badge>
          </div>
          <h1 className="mt-4 text-4xl font-semibold  sm:text-5xl">
            We found your product
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Check that this looks right, then tell us what you want to share.
            You can review the website details below whenever you need them.
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

      <div className="mt-6 rounded-container border border-line bg-surface-raised p-5 sm:p-6">
        <h2 className="text-xl font-semibold">{brand.projectName}</h2>
        <p className="mt-2 text-sm leading-6">{brand.tagline}</p>
        <p className="mt-3 text-sm text-muted">For {brand.audience || "people interested in your product"}</p>
      </div>
      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-semibold text-accent">Review or edit website details and sources (optional)</summary>
      {onRescan && (
        <div className="mt-6 flex flex-col gap-3 rounded-container border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted">
            {confirmingRescan
              ? `Rescanning replaces these colors, fonts, details and the screenshot with what the website shows now, including any edits you made here.${rescanResetsWork ? " This campaign's generated posts and concepts will start over." : ""}`
              : "These details are saved with the project and reused for every campaign. Rescan when the website changes."}
          </p>
          <div className="flex shrink-0 gap-2">
            {confirmingRescan ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingRescan(false)}>Cancel</Button>
                <Button size="sm" onClick={() => { setConfirmingRescan(false); onRescan(); }}>Rescan now</Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmingRescan(true)}>
                <ArrowClockwise size={14} aria-hidden="true" /> Rescan website
              </Button>
            )}
          </div>
        </div>
      )}
      {brand.brandIntelligence && (
        <section
          aria-labelledby="brand-interpretation-title"
          className="mt-6 rounded-container border border-line bg-surface-raised p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="brand-interpretation-title" className="text-lg font-semibold">
                Brand interpretation
              </h2>
              <p className="mt-1 text-xs text-muted">
                Guidance inferred from the scanned pages; these points are not verified product facts.
              </p>
            </div>
            <Badge>AI guidance · not evidence</Badge>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-6">
            {brand.brandIntelligence.productPurpose}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {interpretationGroups.map(({ title, items }) => (
              <div key={title} className="rounded-control border border-line bg-canvas p-3">
                <h3 className="text-[10px] font-semibold uppercase  text-muted">
                  {title}
                </h3>
                <ul className="mt-2 space-y-1 text-xs leading-5">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {brand.brandIntelligence.unsupportedClaimsToAvoid.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted">
              Claims to avoid: {brand.brandIntelligence.unsupportedClaimsToAvoid.join(" · ")}
            </p>
          )}
        </section>
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
            {brand.visualSystem && (
              <div className="border-t border-line pt-5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Palette aria-hidden="true" size={16} />
                  Source visual system
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                  <div className="rounded-control border border-line bg-canvas p-3">
                    <span className="block text-[10px] uppercase ">Shape</span>
                    <span className="mt-1 block text-ink">{brand.visualSystem.radius}px corners · {brand.visualSystem.spacing}px rhythm</span>
                  </div>
                  <div className="rounded-control border border-line bg-canvas p-3">
                    <span className="flex items-center gap-1 text-[10px] uppercase "><TextAa aria-hidden="true" size={13} /> Type</span>
                    <span className="mt-1 block text-ink">{brand.visualSystem.headingFont} + {brand.visualSystem.bodyFont}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2" aria-label="Mapped source colors">
                  {[brand.visualSystem.backgroundColor, brand.visualSystem.foregroundColor, brand.visualSystem.accentColor].map((color) => (
                    <span key={color} className="size-8 rounded-full border border-line" style={{ backgroundColor: color }} title={color} />
                  ))}
                  <span className="self-center text-xs text-muted">
                    {brand.visualSystem.usesGradient ? "Source uses a gradient" : "Flat source treatment"}
                  </span>
                </div>
              </div>
            )}
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
              Kept source facts
            </h2>
            <span className="font-sans text-[11px] uppercase  text-muted">
              {approvedCount} kept for copy
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {brand.claims.length === 0 && (
              <div className="rounded-container border border-line bg-surface-raised p-6">
                <p className="font-semibold">No reliable claims were extracted.</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  You can still generate from the update details you enter. The
                  output will call out that it has no source-backed claim.
                </p>
              </div>
            )}
            {brand.claims.map((claim) => (
              <article
                key={claim.id}
                className="rounded-container border border-accent/40 bg-surface-raised p-5"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 shrink-0 text-accent" size={18} weight="fill" />
                  <div>
                    <p className="text-sm font-semibold leading-6">{claim.text}</p>
                    <p className="mt-1 text-[11px] uppercase  text-accent">Kept for campaign copy</p>
                  </div>
                </div>
                <blockquote className="mt-3 border-l-2 border-line pl-3 text-xs leading-5 text-muted">
                  {claim.sourceExcerpt}
                </blockquote>
                <div className="mt-4">
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
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      </details>
      <StudioActionBar
        backLabel="Change source"
        onBack={onBack}
        nextLabel="Write my announcement"
        onNext={onContinue}
        helper={
          approvedCount === 0
            ? "We couldn’t confirm product details from the website. Tell us what’s new in the next step."
            : `We’ll use ${approvedCount === 1 ? "the product fact" : "the product facts"} you approved when writing your posts.`
        }
      />
    </div>
  );
}
