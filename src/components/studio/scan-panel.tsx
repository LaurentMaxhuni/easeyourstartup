"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Browser,
  GlobeSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import type { ScanResult } from "@/lib/contracts";

export function ScanPanel({
  status,
  error,
  result,
  onScan,
}: {
  status: "idle" | "loading" | "success" | "error";
  error: string;
  result: ScanResult | null;
  onScan: (url?: string, demo?: boolean) => Promise<void>;
}) {
  const [url, setUrl] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onScan(url, false);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
          Start with your source
        </p>
        <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
          Bring your product into the studio.
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-muted">
          Paste a public website. We will map the important pages, images, and
          claims into an editable campaign workspace.
        </p>
      </div>
      <div className="rounded-container border border-line bg-surface-raised p-5 sm:p-8">
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
              {status === "loading" ? "Scanning" : "Scan site"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Public pages only. No login or setup required.
          </p>
          {error && (
            <p id="scan-error" role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          {status === "loading" && (
            <div className="mt-5 flex items-start gap-3 rounded-control border border-accent/30 bg-accent/10 p-4">
              <LoadingIndicator className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold">Reading your public site</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Finding pages, brand colors, source claims, and real images.
                </p>
              </div>
            </div>
          )}
        </form>

        <div className="my-7 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={() => onScan(undefined, true)}
          disabled={status === "loading"}
          className="group flex w-full items-center justify-between rounded-control border border-line bg-canvas p-4 text-left transition-colors hover:border-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-control bg-accent text-accent-ink">
              <Browser size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold">
                Try the complete demo
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                Explore the full flow without connecting a site
              </span>
            </span>
          </span>
          <ArrowRight
            className="text-muted transition-transform group-hover:translate-x-0.5"
            size={18}
          />
        </button>

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
