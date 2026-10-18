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
    <form onSubmit={submit} className="mt-7 max-w-2xl">
      <label htmlFor="hero-url" className="mb-2 block text-sm font-semibold">Your product website</label>
      <div className={`flex flex-col gap-2 rounded-container border bg-surface-raised p-2 shadow-[0_8px_24px_-12px_var(--accent-halo)] focus-within:shadow-[0_0_0_3px_var(--accent-halo)] sm:flex-row ${error ? "border-danger" : "border-line focus-within:border-accent"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
          <GlobeSimple
            aria-hidden="true"
            className="shrink-0 text-muted"
            size={20}
          />
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
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby="hero-scan-feedback"
            className="border-0 bg-transparent px-0 text-base shadow-none focus:border-0"
          />
        </div>
        <Button type="submit" size="lg">
          Scan my site
          <ArrowRight aria-hidden="true" size={18} />
        </Button>
      </div>
      <div className={`mt-3 px-1 text-xs leading-5 ${error ? "text-danger" : "text-muted"}`}>
        <span id="hero-scan-feedback" aria-live="polite">
          {error || "Sign in first, then we’ll scan and save the project to your dashboard."}
        </span>
      </div>
    </form>
  );
}
