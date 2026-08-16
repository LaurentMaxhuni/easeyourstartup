"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GlobeSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function HeroScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a public HTTP or HTTPS website.");
      return;
    }
    setError("");
    const nextPath = `/studio?url=${encodeURIComponent(normalized)}`;
    router.push(`/login?next=${encodeURIComponent(nextPath)}`);
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
        <span id="hero-scan-feedback" aria-live="polite">
          {error || "Sign in required. No credit card for your first scan."}
        </span>
        <button
          type="button"
          className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
          onClick={() =>
            router.push(
              `/login?next=${encodeURIComponent("/studio?demo=1")}`,
            )
          }
        >
          Explore the demo
        </button>
      </div>
    </form>
  );
}
