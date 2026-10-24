"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import {
  ArrowRight,
  GlobeSimple,
} from "@phosphor-icons/react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { CampaignLoader } from "@/components/ui/campaign-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScanResult } from "@/lib/contracts";

export function ScanPanel({
  status,
  error,
  result,
  previewUrl = null,
  onScan,
}: {
  status: "idle" | "loading" | "success" | "error";
  error: string;
  result: ScanResult | null;
  previewUrl?: string | null;
  onScan: (url?: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<{ url: string; loaded: boolean } | null>(null);
  const previewReady = preview?.url === previewUrl && preview.loaded;
  const previewFailed = preview?.url === previewUrl && !preview.loaded;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onScan(url);
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:py-20">
      <div className="min-w-0">
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
      <div className="min-w-0 rounded-container border border-line bg-surface-raised p-5 sm:p-8">
        <form onSubmit={submit} aria-busy={status === "loading"}>
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
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://yourproduct.com"
                inputMode="url"
                autoComplete="url"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "scan-error" : undefined}
                className="pl-10"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={status === "loading"}
            >
              {status === "loading" ? (
                <LoadingIndicator size="sm" />
              ) : (
                <ArrowRight size={18} />
              )}
              {status === "loading" ? "Reading website" : "Use this website"}
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
          {status === "loading" && (
            <div role="status" aria-live="polite" className="mt-5 flex flex-col items-center gap-2 rounded-control border border-line bg-canvas/50 p-5 text-center">
              <div className="website-scan-preview" data-ready={previewReady ? "true" : "false"}>
                {previewUrl && !previewFailed && (
                  <Image
                    key={previewUrl}
                    src={previewUrl}
                    alt="Screenshot of the website being scanned"
                    fill
                    unoptimized
                    loading="eager"
                    className="website-scan-image"
                    onLoad={() => setPreview({ url: previewUrl, loaded: true })}
                    onError={() => setPreview({ url: previewUrl, loaded: false })}
                  />
                )}
                {previewReady ? (
                  <div aria-hidden="true" className="website-scan-sweep" />
                ) : (
                  <div className="website-scan-fallback"><CampaignLoader activity="scanning" /></div>
                )}
              </div>
              <div className="pb-1">
                <p className="text-sm font-semibold">Reading your public site</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Finding pages, brand colors, source claims, and real images.
                </p>
              </div>
            </div>
          )}
        </form>

        {result && (
          <p className="mt-5 text-xs text-muted">
            Last scan: {result.profile.projectName}, {result.pages.length} source
            pages
          </p>
        )}
      </div>
    </div>
  );
}
