"use client";

import { Check } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { LogoMark } from "@/components/logo";
import { generationOrbState, type GenerationScreenStage } from "@/lib/studio/generation-progress";

export type { GenerationScreenStage } from "@/lib/studio/generation-progress";

const stages = ["Request saved", "Writing your posts", "Creating your visual"];
export function GenerationProgressScreen({
  projectName,
  channelCount,
  stage,
}: {
  projectName: string;
  channelCount: number;
  stage: GenerationScreenStage;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const takingLonger = elapsedSeconds >= 90;
  const activeStage = stage === "preparing" || stage === "queued"
    ? 0
    : stage === "writing"
      ? 1
      : 2;
  const orbState = generationOrbState(stage, elapsedSeconds);
  const activityLabel = stage === "visuals"
    ? "Creating your visual"
    : stage === "writing"
      ? "Generating campaign copy"
      : "Preparing your campaign";
  const title = stage === "preparing"
    ? "Getting your posts started"
      : stage === "queued"
        ? "Your request is saved"
      : stage === "writing"
        ? "Writing your posts"
        : "Creating your visual";
  const description = stage === "preparing"
    ? "We’re saving your announcement and the platforms you chose."
      : stage === "queued"
        ? "We’re getting started. Your posts will appear here when they’re ready."
      : stage === "writing"
        ? `Creating tailored copy for ${channelCount} selected ${channelCount === 1 ? "channel" : "channels"}.`
        : "Using your brand colors and reviewed wording to make a matching image.";

  return (
    <main className="fixed inset-0 z-[80] min-h-[100dvh] overflow-y-auto bg-canvas text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_36%,rgba(91,131,255,0.13),transparent_58%)]"
      />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 py-5 sm:px-8 sm:py-6">
        <header className="flex items-center gap-3">
          <LogoMark />
          <span className="text-sm font-semibold">EaseYourStartup</span>
          <span className="ml-auto max-w-[45%] truncate text-right text-xs text-muted sm:text-sm">
            {projectName}
          </span>
        </header>

        <section
          role="status"
          aria-live="polite"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-4 text-center sm:py-12"
        >
          <div className="relative mb-4 grid size-40 place-items-center sm:mb-9 sm:size-64" aria-hidden="true">
            <div className="absolute size-40 rounded-full bg-accent/15 blur-3xl" />
            <div className="absolute size-44 rounded-full border border-accent/15 motion-safe:animate-[spin_24s_linear_infinite]" />
            <div className="absolute size-32 rounded-full border border-dashed border-accent/20 motion-safe:animate-[spin_32s_linear_infinite_reverse]" />
            <ThinkingOrb
              className="relative z-10"
              state={orbState}
              size={64}
              style={{ transform: "scale(2)" }}
              data-generation-orb={orbState}
              aria-hidden="true"
            />
          </div>

          <p className="text-sm font-medium text-accent">{activityLabel}</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            {description}
          </p>

          <ol className="mt-5 grid w-full gap-3 text-left sm:mt-9 sm:grid-cols-3">
            {stages.map((label, index) => {
              const complete = index < activeStage;
              const active = index === activeStage;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-center gap-2 border-t pt-3 text-xs ${
                    active ? "border-accent text-ink" : complete ? "border-accent/50 text-muted" : "border-line text-muted"
                  }`}
                >
                  <span className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    complete ? "border-accent bg-accent text-accent-ink" : active ? "border-accent text-accent" : "border-line"
                  }`}>
                    {complete ? <Check size={12} weight="bold" /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-muted sm:mt-8">
            {takingLonger ? "This is taking longer than expected. Your saved request will keep running." : "You’ll be able to review and edit everything before sharing."}
          </p>
          <p aria-live="off" className="mt-3 text-xs tabular-nums text-muted">Elapsed {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</p>
          {stage !== "preparing" && <Link href="/dashboard" className="mt-5 rounded-control border border-line px-5 py-3 text-sm font-semibold hover:bg-surface">Back to my projects</Link>}
        </section>
      </div>
    </main>
  );
}
