"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check } from "@phosphor-icons/react";
import { CampaignLoader } from "@/components/ui/campaign-loader";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type ScanElementKind = "logo" | "nav" | "headline" | "copy" | "cta" | "image";

type ScanElement = {
  kind: ScanElementKind;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type LivePreview = {
  image: string;
  title: string;
  elements: ScanElement[];
  palette: string[];
  fonts: string[];
  viewport: { width: number; height: number };
};

export type ScanStage = "queued" | "reading" | "analyzing";

const KIND_LABEL: Record<ScanElementKind, string> = {
  logo: "Logo",
  nav: "Nav",
  headline: "Headline",
  copy: "Copy",
  cta: "CTA",
  image: "Visual",
};

// Keep in sync with the beam keyframes in globals.css: a box lights up as the
// beam passes its top edge, and its feed entry appears at the same moment.
const BEAM_START_MS = 300;
const BEAM_PASS_MS = 2_600;
const delayFor = (y: number) => Math.round(BEAM_START_MS + y * BEAM_PASS_MS);

type FeedEntry = { key: string; kind: ScanElementKind | "style"; delay: number; label: string; detail: string };

function feedEntries(preview: LivePreview): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const byKind = (kind: ScanElementKind) => preview.elements.filter((element) => element.kind === kind);
  const first = (kind: ScanElementKind) => byKind(kind)[0];
  const logo = first("logo");
  if (logo) entries.push({ key: "logo", kind: "logo", delay: delayFor(logo.y), label: "Logo", detail: logo.text || "Brand mark" });
  const nav = byKind("nav");
  if (nav.length > 0) {
    entries.push({
      key: "nav",
      kind: "nav",
      delay: delayFor(nav[0].y),
      label: `${nav.length} navigation link${nav.length === 1 ? "" : "s"}`,
      detail: nav.map((link) => link.text).join(" · "),
    });
  }
  const headline = first("headline");
  if (headline) entries.push({ key: "headline", kind: "headline", delay: delayFor(headline.y), label: "Headline", detail: `“${headline.text}”` });
  const copy = first("copy");
  if (copy) entries.push({ key: "copy", kind: "copy", delay: delayFor(copy.y), label: "Positioning copy", detail: copy.text });
  for (const [index, cta] of byKind("cta").entries()) {
    entries.push({ key: `cta-${index}`, kind: "cta", delay: delayFor(cta.y), label: "Call to action", detail: cta.text });
  }
  const images = byKind("image");
  if (images.length > 0) {
    entries.push({
      key: "images",
      kind: "image",
      delay: delayFor(images[0].y),
      label: `${images.length} product visual${images.length === 1 ? "" : "s"}`,
      detail: "Candidates for your launch graphics",
    });
  }
  const beamEnd = BEAM_START_MS + BEAM_PASS_MS;
  if (preview.fonts.length > 0) {
    entries.push({ key: "fonts", kind: "style", delay: beamEnd + 150, label: "Typography", detail: preview.fonts.join(", ") });
  }
  return entries.sort((a, b) => a.delay - b.delay);
}

export function ScanLiveView({
  url,
  host,
  stage,
}: {
  url: string | null;
  host: string;
  stage: ScanStage;
}) {
  const [result, setResult] = useState<{ url: string; preview: LivePreview | null } | null>(null);
  const preview = result?.url === url ? result.preview : null;
  // A scan resumed after reload has no preview request to show.
  const failed = !url || (result?.url === url && !result.preview);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Preview unavailable.");
        const data = (await response.json()) as LivePreview;
        // Decode before revealing so the beam never sweeps over a blank frame.
        const image = new window.Image();
        image.src = data.image;
        await image.decode();
        setResult({ url, preview: data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ url, preview: null });
      });
    return () => controller.abort();
  }, [url]);

  const feed = preview ? feedEntries(preview) : [];
  // One tag for the whole nav group, at its right end, clear of the logo tag.
  const lastNavIndex = preview ? preview.elements.findLastIndex((element) => element.kind === "nav") : -1;
  const mapped = Boolean(preview);
  const steps = [
    { key: "open", label: `Opening ${host}`, done: mapped || failed || stage !== "queued", active: !mapped && !failed },
    ...(failed ? [] : [{ key: "map", label: "Mapping the first screen", done: mapped, active: false, delay: BEAM_START_MS + BEAM_PASS_MS }]),
    { key: "read", label: "Reading linked pages and stylesheets", done: stage === "analyzing", active: stage !== "analyzing" },
    { key: "analyze", label: "Curating claims and brand voice", done: false, active: stage === "analyzing" },
  ];

  return (
    <div className="scan-live" data-ready={mapped ? "true" : "false"}>
      <div className="scan-live__viewport" aria-hidden="true">
        {preview ? (
          <div
            className="scan-live__window"
            style={{ "--scan-aspect": preview.viewport.width / preview.viewport.height } as CSSProperties}
          >
            <div className="scan-live__chrome">
              <i /><i /><i />
              <span className="scan-live__address">{host}</span>
            </div>
            <div className="scan-live__page">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL from the scan capture */}
              <img className="scan-live__shot" src={preview.image} alt="" />
              <div className="scan-live__grid" />
              {preview.elements.map((element, index) => (
                <div
                  key={`${element.kind}-${index}`}
                  className="scan-live__box"
                  data-kind={element.kind}
                  data-top-edge={element.y < 0.04 ? "true" : undefined}
                  data-tag-end={element.kind === "nav" ? "true" : undefined}
                  style={{
                    left: `${element.x * 100}%`,
                    top: `${element.y * 100}%`,
                    width: `${element.w * 100}%`,
                    height: `${element.h * 100}%`,
                    animationDelay: `${delayFor(element.y)}ms`,
                  }}
                >
                  {(element.kind !== "nav" || index === lastNavIndex) && (
                    <span className="scan-live__tag">{KIND_LABEL[element.kind]}</span>
                  )}
                </div>
              ))}
              <div className="scan-live__beam" />
            </div>
          </div>
        ) : (
          <div className="scan-live__waiting">
            <CampaignLoader activity="scanning" />
          </div>
        )}
      </div>

      <aside className="scan-live__feed" aria-live="polite" aria-label="What the scan found">
        <p className="scan-live__eyebrow">Live scan</p>
        <p className="scan-live__host">{host}</p>
        {preview && (
          <ul className="scan-live__found">
            {feed.map((entry) => (
              <li key={entry.key} className="scan-live__item" data-kind={entry.kind} style={{ animationDelay: `${entry.delay}ms` }}>
                <span className="scan-live__item-label">{entry.label}</span>
                <span className="scan-live__item-detail">{entry.detail}</span>
              </li>
            ))}
            {preview.palette.length > 0 && (
              <li className="scan-live__item" data-kind="style" style={{ animationDelay: `${BEAM_START_MS + BEAM_PASS_MS}ms` }}>
                <span className="scan-live__item-label">Brand colors</span>
                <span className="scan-live__swatches">
                  {preview.palette.map((color) => (
                    <span key={color} className="scan-live__swatch" style={{ background: color }} title={color} />
                  ))}
                </span>
              </li>
            )}
          </ul>
        )}
        <ol className="scan-live__steps">
          {steps.map((step) => (
            <li
              key={step.key}
              className="scan-live__step"
              data-state={step.done ? "done" : step.active ? "active" : "pending"}
              style={"delay" in step ? { "--step-delay": `${step.delay}ms` } as CSSProperties : undefined}
            >
              <span className="scan-live__step-icon">
                {step.done ? <Check size={12} weight="bold" /> : step.active ? <LoadingIndicator size="sm" /> : null}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
