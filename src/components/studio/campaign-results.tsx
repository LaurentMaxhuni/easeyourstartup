"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RenderComposition } from "@/components/render-composition";
import { ChannelOutputs } from "@/components/studio/channel-outputs";
import type { VisualStudioProps } from "@/components/studio/visual-studio";
import { Button } from "@/components/ui/button";

export function CampaignResults({ onEditVisual, captureRef, ...props }: VisualStudioProps & { onEditVisual: () => void }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / props.composition.output.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.composition.output.width]);

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <header className="border-b border-line bg-surface-raised px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm font-semibold text-accent">Back to my projects</Link>
          <div className="flex items-center gap-3">
            <p role="status" className="text-xs text-muted">{props.saveStatus === "saving" ? "Saving…" : props.saveStatus === "saved" ? "Changes saved" : ""}</p>
            <Button variant="secondary" size="sm" onClick={() => void props.onSave()} disabled={props.saveStatus === "saving"}>Save changes</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold sm:text-4xl">Your posts are ready to review</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Read each post, make any changes, and copy it to the place you want to share it. Nothing has been published.</p>
        {props.saveError && <p role="alert" className="mt-4 text-sm text-danger">{props.saveError}</p>}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.2fr_.8fr]">
          <ChannelOutputs outputs={props.outputs} claims={props.aiContext.approvedClaims} onChange={props.onOutputsChange}
            onRegenerate={props.onRegenerateChannel} regenerationRemaining={props.regenerationRemaining}
            regenerationBusyChannel={props.regenerationBusyChannel} plan={props.plan} />
          <section aria-labelledby="matching-visual-title" className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 id="matching-visual-title" className="text-xl font-semibold">Your visual</h2>
              <Button variant="secondary" size="sm" onClick={onEditVisual}>Edit visual</Button>
            </div>
            <p className="mt-1 text-xs text-muted">A matching image to share alongside your post.</p>
            {props.creativeDirections.length > 1 && <label className="mt-4 block text-xs font-semibold">Choose a visual
              <select className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-raised px-3 text-sm"
                value={props.selectedCreativeId} onChange={(event) => props.onSelectCreativeDirection(event.target.value)}>
                {props.creativeDirections.map((direction) => <option key={direction.id} value={direction.id}>{direction.headline}</option>)}
              </select>
            </label>}
            <div ref={previewRef} className="relative mt-4 overflow-hidden rounded-container border border-line"
              style={{ aspectRatio: props.composition.output.width / props.composition.output.height }}>
              <div ref={captureRef} style={{ width: props.composition.output.width, height: props.composition.output.height,
                transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <RenderComposition composition={props.composition} />
                {props.plan !== "pro" && <span className="absolute bottom-3 right-4 rounded bg-white/90 px-3 py-1 text-sm text-black">Made with EaseYourStartup</span>}
              </div>
            </div>
            {props.autoDesignStatus === "loading" && <p role="status" className="mt-3 text-xs text-muted">Preparing your visual…</p>}
            {(props.autoDesignWarning || props.uploadError) && <p role="alert" className="mt-3 text-xs text-danger">{props.autoDesignWarning || props.uploadError}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void props.onExportPng()} disabled={props.exportStatus === "loading" || !props.canExportLaunchKit}>{props.exportStatus === "loading" ? "Preparing download…" : "Download image"}</Button>
              <Button variant="secondary" onClick={() => void props.onExportZip()} disabled={props.exportStatus === "loading" || !props.canExportLaunchKit}>Download all posts</Button>
            </div>
            {!props.canExportLaunchKit && <p className="mt-3 text-xs leading-5 text-muted">Copying posts is free. <Link href="/pricing" className="text-accent underline">Pro Lite and Pro include image downloads and all posts in one file.</Link></p>}
            {props.exportError && <p role="alert" className="mt-3 text-sm text-danger">{props.exportError}</p>}
            {props.exportDownloadUrl && <a className="mt-3 inline-block text-sm font-semibold text-accent underline" href={props.exportDownloadUrl}>Your download is ready</a>}
          </section>
        </div>
      </main>
    </div>
  );
}
