"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  GlobeSimple,
} from "@phosphor-icons/react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onScan: (url?: string) => Promise<void>;
}) {
  const [url, setUrl] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onScan(url);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
      <div>
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
                <ThinkingOrb state="searching" size={20} aria-hidden="true" />
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
            <div role="status" aria-live="polite" className="mt-5 flex items-center gap-4 rounded-control border border-accent/30 bg-accent/10 p-4">
              <ThinkingOrb className="shrink-0" state="searching" size={64} aria-hidden="true" />
              <div>
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
