"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import {
  ArrowRight,
  GlobeSimple,
} from "@phosphor-icons/react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { ScanLiveView, type ScanStage } from "@/components/studio/scan-live-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScanResult } from "@/lib/contracts";

export function ScanPanel({
  status,
  error,
  result,
  previewUrl = null,
  livePreviewUrl = null,
  stage = "queued",
  onScan,
}: {
  status: "idle" | "loading" | "success" | "error";
  error: string;
  result: ScanResult | null;
  previewUrl?: string | null;
  livePreviewUrl?: string | null;
  stage?: ScanStage;
  onScan: (url?: string) => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; loaded: boolean } | null>(null);
  const previewReady = preview?.url === previewUrl && preview.loaded;
  const previewFailed = preview?.url === previewUrl && !preview.loaded;
  const showingWebsite = Boolean(previewUrl && !previewFailed);
  const immersive = showingWebsite;
  const captureTarget = [livePreviewUrl, previewUrl]
    .map((source) => source?.match(/^\/api\/capture(?:\/scan-preview)?\?(.*)$/)?.[1])
    .map((query) => (query ? new URLSearchParams(query).get("target") : null))
    .find(Boolean) ?? null;
  const inputUrl = url ?? captureTarget ?? result?.pages[0]?.url ?? "";
  let scanHost = inputUrl;
  try {
    scanHost = new URL(inputUrl).hostname.replace(/^www\./, "");
  } catch {
    // Keep the typed value when it isn't a full URL yet.
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onScan(inputUrl);
  }

  if (status === "loading") {
    return (
      <section className="website-scan-stage" data-immersive="true" aria-label="Website scan" aria-busy="true">
        <ScanLiveView url={livePreviewUrl} host={scanHost || "your website"} stage={stage} />
      </section>
    );
  }

  return (
    <section className="website-scan-stage" data-immersive={immersive ? "true" : "false"} aria-label="Website scan">
      {immersive && (
        <div className="website-scan-preview" data-ready={previewReady ? "true" : "false"}>
          {showingWebsite && previewUrl && (
            <Image
              key={previewUrl}
              src={previewUrl}
              alt="Screenshot of your website"
              fill
              unoptimized
              loading="eager"
              className="website-scan-image"
              onLoad={() => setPreview({ url: previewUrl, loaded: true })}
              onError={() => setPreview({ url: previewUrl, loaded: false })}
            />
          )}
          {previewReady ? (
            <div aria-hidden="true" className="website-scan-shade" />
          ) : (
            <div className="website-scan-fallback">
              <LoadingIndicator label="Loading website preview" />
            </div>
          )}
        </div>
      )}
      <div className="website-scan-controls">
        <div className={immersive ? "sr-only" : "min-w-0"}>
          <p className="font-sans text-xs uppercase  text-accent">
            Start with your website
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold  sm:text-6xl">
            Turn your website into posts.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted">
            Paste your product’s website. We’ll learn what it does and how it looks,
            then help you share your next announcement.
          </p>
        </div>
        <div className="website-scan-form min-w-0 rounded-container border border-line bg-surface-raised p-5 sm:p-8">
          <form onSubmit={submit}>
            <label className="text-sm font-semibold" htmlFor="scan-url">
              Website URL
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <GlobeSimple
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                  size={18}
                />
                <Input
                  id="scan-url"
                  value={inputUrl}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://yourproduct.com"
                  inputMode="url"
                  autoComplete="url"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "scan-error" : undefined}
                  className="pl-10"
                />
              </div>
              <Button type="submit" size="lg">
                <ArrowRight size={18} />
                Use this website
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              Public pages only. Your account keeps this project and its source pages together.
            </p>
            {error && (
              <p id="scan-error" role="alert" className="mt-3 text-sm text-danger">
                {error}
              </p>
            )}
          </form>

          {result && (
            <p className="mt-5 text-xs text-muted">
              Last scan: {result.profile.projectName}, {result.pages.length} source
              pages
            </p>
          )}
          {previewFailed && <p className="mt-3 text-xs text-muted">Website preview unavailable.</p>}
        </div>
      </div>
    </section>
  );
}
