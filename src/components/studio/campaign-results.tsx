"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChannelOutputs } from "@/components/studio/channel-outputs";
import { Button } from "@/components/ui/button";
import type { BrandClaim, ChannelOutput } from "@/lib/contracts";

export function CampaignResults({
  outputs,
  claims,
  onOutputsChange,
  onRegenerateChannel,
  regenerationRemaining,
  regenerationBusyChannel,
  plan,
  canExportLaunchKit,
  saveStatus,
  saveError,
  onSave,
  visual,
  visualReady,
  exportStatus,
  exportError,
  exportDownloadUrl,
  onExportPng,
  onExportZip,
}: {
  outputs: ChannelOutput[];
  claims: BrandClaim[];
  onOutputsChange: (outputs: ChannelOutput[]) => void;
  onRegenerateChannel?: (channel: ChannelOutput["channel"]) => Promise<void>;
  regenerationRemaining?: Partial<Record<ChannelOutput["channel"], number>>;
  regenerationBusyChannel?: ChannelOutput["channel"] | null;
  plan: "free" | "pro_lite" | "pro";
  canExportLaunchKit: boolean;
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  saveError: string;
  onSave: () => Promise<void>;
  visual: ReactNode;
  visualReady: boolean;
  exportStatus: "idle" | "loading";
  exportError: string;
  exportDownloadUrl: string | null;
  onExportPng: () => Promise<void>;
  onExportZip: () => Promise<void>;
}) {
  const exportDisabled = exportStatus === "loading" || !canExportLaunchKit || !visualReady;
  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <header className="border-b border-line bg-surface-raised px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm font-semibold text-accent">Back to my projects</Link>
          <div className="flex items-center gap-3">
            <p role="status" className="text-xs text-muted">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Changes saved" : ""}</p>
            <Button variant="secondary" size="sm" onClick={() => void onSave()} disabled={saveStatus === "saving"}>Save changes</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-3xl font-semibold sm:text-4xl">Your posts are ready to review</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Read each post, make any changes, and copy it to the place you want to share it. Nothing has been published.</p>
        {saveError && <p role="alert" className="mt-4 text-sm text-danger">{saveError}</p>}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.2fr_.8fr]">
          <ChannelOutputs outputs={outputs} claims={claims} onChange={onOutputsChange}
            onRegenerate={onRegenerateChannel} regenerationRemaining={regenerationRemaining}
            regenerationBusyChannel={regenerationBusyChannel} plan={plan} />
          <section aria-labelledby="matching-visual-title" className="min-w-0">
            {visual}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void onExportPng()} disabled={exportDisabled}>{exportStatus === "loading" ? "Preparing download…" : "Download image"}</Button>
              <Button variant="secondary" onClick={() => void onExportZip()} disabled={exportDisabled}>Download all posts</Button>
            </div>
            {!canExportLaunchKit && <p className="mt-3 text-xs leading-5 text-muted">Copying posts is free. <Link href="/pricing" className="text-accent underline">Pro Lite and Pro include image downloads and all posts in one file.</Link></p>}
            {exportError && <p role="alert" className="mt-3 text-sm text-danger">{exportError}</p>}
            {exportDownloadUrl && <a className="mt-3 inline-block text-sm font-semibold text-accent underline" href={exportDownloadUrl}>Your download is ready</a>}
          </section>
        </div>
      </main>
    </div>
  );
}
