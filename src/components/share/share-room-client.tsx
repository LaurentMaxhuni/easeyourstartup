"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  Copy,
  DownloadSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { DEMO_OUTPUTS } from "@/lib/demo-data";
import { CHANNEL_LABELS } from "@/lib/channels";
import { cn } from "@/lib/utils";

export function ShareRoomClient() {
  const [active, setActive] = useState(DEMO_OUTPUTS[0].channel);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const output =
    DEMO_OUTPUTS.find((item) => item.channel === active) ?? DEMO_OUTPUTS[0];

  function track(event: "copy" | "download") {
    void fetch("/api/share-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ slug: "demo-launch", event }),
    });
  }

  async function copyMessage() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(output.primaryCopy);
      setCopyError("");
      setCopied(true);
      track("copy");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(
        "Copy is unavailable here. Select the message to copy it manually.",
      );
    }
  }

  function downloadVisual() {
    track("download");
    const anchor = document.createElement("a");
    anchor.href = "/images/studio-capture.png";
    anchor.download = "easeyourstartup-launch.png";
    anchor.click();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
      <div className="relative min-h-[560px] overflow-hidden rounded-container border border-line bg-ink">
        <Image
          src="/images/studio-capture.png"
          alt="EaseYourStartup launch studio"
          fill
          priority
          className="object-cover object-left-top"
          sizes="(max-width: 1024px) 94vw, 52vw"
        />
        <div className="absolute inset-x-5 bottom-5 rounded-container border border-white/20 bg-[#171917]/92 p-5 text-[#f4f3ef] backdrop-blur-md">
          <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-[#bec3bb]">
            EaseYourStartup
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            Turn every ship into a campaign.
          </h2>
        </div>
      </div>
      <div>
        <div
          role="tablist"
          aria-label="Published channel copy"
          className="flex overflow-x-auto border-b border-line"
        >
          {DEMO_OUTPUTS.map((item) => (
            <button
              key={item.channel}
              type="button"
              onClick={() => setActive(item.channel)}
              role="tab"
              aria-selected={active === item.channel}
              className={cn(
                "min-w-fit border-b-2 px-4 pb-3 text-sm font-semibold transition-colors",
                active === item.channel
                  ? "border-accent text-ink"
                  : "border-transparent text-muted",
              )}
            >
              {CHANNEL_LABELS[item.channel]}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-container border border-line bg-surface-raised p-5">
          <p className="whitespace-pre-wrap text-sm leading-7">
            {output.primaryCopy}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button onClick={copyMessage} size="lg">
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Copied" : "Copy message"}
          </Button>
          <Button onClick={downloadVisual} variant="secondary" size="lg">
            <DownloadSimple size={18} />
            Download visual
          </Button>
        </div>
        {copyError && (
          <p role="alert" className="mt-3 text-xs leading-5 text-danger">
            {copyError}
          </p>
        )}
        <Button asChild variant="ghost" className="mt-4 w-full">
          <a href="https://easeyourstartup.com" target="_blank" rel="noreferrer">
            Visit EaseYourStartup
            <ArrowUpRight size={17} />
          </a>
        </Button>
        <p className="mt-6 text-center text-xs leading-5 text-muted">
          This public room contains only assets approved by the campaign owner.
          No social account connection is required.
        </p>
      </div>
    </div>
  );
}
