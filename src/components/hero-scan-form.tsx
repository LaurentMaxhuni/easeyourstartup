"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GlobeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePublicWebsiteUrl } from "@/lib/url-input";

export function HeroScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePublicWebsiteUrl(url);
    if (!normalized) {
      setError("Enter a public HTTP or HTTPS website.");
      return;
    }
    setError("");
    router.push(`/studio?url=${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-2xl">
      <div className="flex flex-col gap-2 rounded-container border border-line bg-surface-raised p-2 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
          <GlobeSimple
            aria-hidden="true"
            className="shrink-0 text-muted"
            size={20}
          />
          <span className="sr-only">Public website URL</span>
          <Input
            id="hero-url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError("");
            }}
            placeholder="yourproduct.com"
            inputMode="url"
            autoComplete="url"
            aria-invalid={Boolean(error)}
            aria-describedby="hero-scan-feedback"
            className="border-0 bg-transparent px-0 shadow-none focus:border-0"
          />
        </label>
        <Button type="submit" size="lg">
          Scan my site
          <ArrowRight aria-hidden="true" size={18} />
        </Button>
      </div>
      <div className="mt-3 px-1 text-xs text-muted">
        <span id="hero-scan-feedback" aria-live="polite">
          {error || "Sign in first, then we’ll scan and save the project to your dashboard."}
        </span>
      </div>
    </form>
  );
}
