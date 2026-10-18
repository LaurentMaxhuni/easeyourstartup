"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  ArrowRight, Browser, Check, CheckCircle, EnvelopeSimple, GlobeSimple,
  LinkedinLogo, Pause, Play, Sparkle, XLogo,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const STEPS = ["Scan the source", "Shape the brief", "Build the campaign"];
const FACTS = ["Platform-specific copy", "Real product screenshots", "Source evidence included"];
const CHANNELS = [
  { name: "LinkedIn", icon: LinkedinLogo, copy: "A product update can take weeks to build and ten quiet minutes to announce. Give your next ship the launch it deserves." },
  { name: "X", icon: XLogo, copy: "You shipped the update. Now ship the story. Turn your product URL into a source-backed launch kit." },
  { name: "Email", icon: EnvelopeSimple, copy: "Your next update, ready to share. Meet a launch workflow built around your real product, from source facts to channel-ready copy." },
];

export function LaunchPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [channel, setChannel] = useState(0);
  const running = playing && !reducedMotion;

  useEffect(() => {
    if (!running || !inView) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setStage((current) => (current + 1) % STEPS.length);
    }, 4_800);
    return () => window.clearInterval(timer);
  }, [running, inView]);

  const activeChannel = CHANNELS[channel];
  const ChannelIcon = activeChannel.icon;

  return (
    <div ref={ref} id="campaign-preview" className="campaign-window relative scroll-mt-24 overflow-hidden rounded-[22px] border border-line bg-surface-raised">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white"><Sparkle aria-hidden="true" size={18} weight="fill" /></span>
          <div>
            <p className="text-xs font-semibold">From URL to launch</p>
            <p className="mt-0.5 text-[10px] text-muted">Interactive demo</p>
          </div>
        </div>
        {!reducedMotion && (
          <button type="button" aria-label={playing ? "Pause demo" : "Play demo"} title={playing ? "Pause demo" : "Play demo"} onClick={() => setPlaying((current) => !current)} className="flex size-10 items-center justify-center rounded-full border border-line text-muted hover:bg-surface hover:text-ink">
            {playing ? <Pause aria-hidden="true" size={15} weight="fill" /> : <Play aria-hidden="true" size={15} weight="fill" />}
          </button>
        )}
      </div>

      <div role="region" aria-label={`Demo: ${STEPS[stage]}`} className="relative flex min-h-[390px] flex-col overflow-hidden bg-canvas/65 p-4 sm:min-h-[430px] sm:p-7">
        <div aria-hidden="true" className="hero-demo-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mb-6 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted">
          <span>{STEPS[stage]}</span><span className="tabular-nums">0{stage + 1} / 03</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stage} initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -10 }} transition={{ duration: reducedMotion ? 0 : 0.25 }} className="relative flex flex-1 flex-col justify-center">
            {stage === 0 && (
              <div>
                <div className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-sm">
                  <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-4 py-3 text-[11px] text-muted"><GlobeSimple aria-hidden="true" size={14} /><span>easeyourstartup.com</span><span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-ink">Public source</span></div>
                  <div className="relative grid grid-cols-[1.2fr_1fr] gap-4 overflow-hidden p-5 sm:p-6">
                    <div aria-hidden="true" className="space-y-3 pt-2">
                      <div className="h-2.5 w-12 rounded bg-accent/60" />
                      <div className="h-4 w-full rounded bg-ink/80" /><div className="h-4 w-3/4 rounded bg-ink/80" />
                      <div className="space-y-1.5 pt-2"><div className="h-1.5 rounded bg-muted/25" /><div className="h-1.5 w-4/5 rounded bg-muted/25" /></div>
                      <div className="h-6 w-20 rounded-md bg-accent" />
                    </div>
                    <div className="flex min-h-36 items-center justify-center rounded-xl border border-accent/20 bg-accent/5">
                      <motion.div animate={running && inView ? { y: [3, -5, 3], rotate: [-4, 3, -4] } : { y: 0, rotate: 0 }} transition={{ duration: 3.5, repeat: running && inView ? Infinity : 0, ease: "easeInOut" }} className="flex size-16 items-center justify-center rounded-2xl bg-accent text-white shadow-[0_8px_32px_var(--accent-halo)] sm:size-20"><Browser aria-hidden="true" size={36} weight="duotone" /></motion.div>
                    </div>
                    {running && inView && <div aria-hidden="true" className="hero-scan-line pointer-events-none absolute inset-x-0 h-px bg-accent shadow-[0_0_16px_3px_var(--accent-halo)]" />}
                  </div>
                </div>
                <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-2 text-[11px] text-muted"><span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />Pages, screenshots, and source facts</div>
              </div>
            )}

            {stage === 1 && (
              <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-center gap-2 text-sm font-semibold"><Sparkle aria-hidden="true" size={18} className="text-accent" />A brief with something behind it.</div>
                <div className="space-y-2.5">
                  {FACTS.map((fact, index) => (
                    <motion.div key={fact} initial={reducedMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reducedMotion ? 0 : index * 0.15, duration: reducedMotion ? 0 : 0.3 }} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-3 text-xs">
                      <CheckCircle aria-hidden="true" size={18} weight="fill" className="shrink-0 text-accent" /><span>{fact}</span><Check aria-hidden="true" size={13} className="ml-auto text-muted" />
                    </motion.div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4 text-[10px] text-muted"><span className="rounded-md bg-surface px-2 py-1">Source-backed</span><span className="rounded-md bg-surface px-2 py-1">Ready for review</span></div>
              </div>
            )}

            {stage === 2 && (
              <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm sm:p-6">
                <div role="group" aria-label="Demo channel" className="mb-5 flex gap-1 border-b border-line pb-3">
                  {CHANNELS.map((item, index) => <button type="button" key={item.name} aria-pressed={channel === index} onClick={() => { setChannel(index); setPlaying(false); }} className={cn("min-h-9 flex-1 rounded-lg px-2 text-[11px] font-medium", channel === index ? "bg-accent text-white" : "text-muted hover:bg-surface hover:text-ink")}>{item.name}</button>)}
                </div>
                <div className="mb-3 flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-full bg-accent/10"><ChannelIcon aria-hidden="true" size={17} className="text-accent" weight="fill" /></span><div><p className="text-xs font-semibold">Your next launch</p><p className="mt-0.5 text-[10px] text-muted">{activeChannel.name} · Campaign draft</p></div></div>
                <AnimatePresence mode="wait" initial={false}><motion.p key={channel} initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} className="min-h-24 text-sm leading-7">{activeChannel.copy}</motion.p></AnimatePresence>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[10px] text-muted"><span className="flex items-center gap-1.5"><CheckCircle aria-hidden="true" size={13} className="text-accent" />Built from your source</span><span>Copy + visuals</span></div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div role="group" aria-label="Demo steps" className="grid grid-cols-3 gap-2 border-t border-line p-3 sm:gap-3 sm:p-4">
        {STEPS.map((step, index) => (
          <button type="button" key={step} aria-pressed={stage === index} onClick={() => { setStage(index); setPlaying(false); }} className={cn("group relative overflow-hidden rounded-lg border px-2 py-3 text-left", stage === index ? "border-accent/30 bg-accent/5" : "border-transparent hover:border-line hover:bg-surface")}>
            <span className={cn("mb-1.5 flex items-center justify-between text-[10px] font-semibold", stage === index ? "text-accent" : "text-muted")}>0{index + 1}<ArrowRight aria-hidden="true" size={12} className={cn("transition-opacity", stage === index ? "opacity-100" : "opacity-0 group-hover:opacity-100")} /></span>
            <span className="block text-[10px] font-medium leading-4 text-ink sm:text-[11px]">{step}</span>
            {stage === index && running && inView && <motion.span key={`${stage}-${playing}`} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 4.8, ease: "linear" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
