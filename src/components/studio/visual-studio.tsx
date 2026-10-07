"use client";

import { useState, type RefObject } from "react";
import { CampaignResults } from "@/components/studio/campaign-results";
import {
  MiniCanvaEditor,
  type CreativeAiContext,
} from "@/components/studio/mini-canva-editor";
import type {
  CreativeComposition,
  ChannelOutput,
  CreativeDirection,
  CreativeDesignInput,
  CreativeDesignResult,
  CreativeMockupDevice,
  CreativeRewriteInput,
} from "@/lib/contracts";
import type { LaunchKitReadiness } from "@/lib/launch-kit";

export type VisualStudioProps = {
  composition: CreativeComposition;
  outputs: ChannelOutput[];
  onRegenerateChannel?: (channel: ChannelOutput["channel"]) => Promise<void>;
  regenerationRemaining?: Partial<Record<ChannelOutput["channel"], number>>;
  regenerationBusyChannel?: ChannelOutput["channel"] | null;
  generationProvider?: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible";
  autoDesignStatus: "idle" | "loading" | "ai" | "error";
  autoDesignWarning?: string;
  creativeDirections: CreativeDirection[];
  selectedCreativeId: string;
  captureRef: RefObject<HTMLDivElement | null>;
  uploadStatus: "idle" | "loading" | "error";
  uploadError: string;
  exportStatus: "idle" | "loading";
  exportError: string;
  exportDownloadUrl: string | null;
  plan: "free" | "pro";
  canExportLaunchKit: boolean;
  campaignsRemaining: number | null;
  usagePeriodEndsAt: string | null;
  launchKitReadiness: LaunchKitReadiness;
  onChange: (composition: CreativeComposition) => void;
  onOutputsChange: (outputs: ChannelOutput[]) => void;
  onSelectCreativeDirection: (id: string) => void;
  onUpload: (
    file: File,
    target?: CreativeMockupDevice | "single",
  ) => Promise<string | null>;
  onAiRewrite: (input: CreativeRewriteInput) => Promise<{
    text: string;
    mode: "ai";
  }>;
  onAiDesign: (input: CreativeDesignInput) => Promise<{
    design: CreativeDesignResult;
    mode: "ai";
    provider?: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible";
  }>;
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  saveError: string;
  onSave: () => Promise<void>;
  aiContext: CreativeAiContext;
  onExportPng: () => Promise<void>;
  onExportZip: () => Promise<void>;
};

export function VisualStudio(props: VisualStudioProps) {
  const {
  composition,
  outputs,
  onRegenerateChannel,
  regenerationRemaining,
  regenerationBusyChannel,
  generationProvider,
  autoDesignStatus,
  autoDesignWarning,
  creativeDirections,
  selectedCreativeId,
  captureRef,
  uploadStatus,
  uploadError,
  exportStatus,
  exportError,
  exportDownloadUrl,
  plan,
  canExportLaunchKit,
  campaignsRemaining,
  usagePeriodEndsAt,
  launchKitReadiness,
  onChange,
  onOutputsChange,
  onSelectCreativeDirection,
  onUpload,
  onAiRewrite,
  onAiDesign,
  saveStatus,
  saveError,
  onSave,
  aiContext,
  onExportPng,
  onExportZip,
  } = props;
  const [editingVisual, setEditingVisual] = useState(false);
  if (!editingVisual) return <CampaignResults {...props}
    onEditVisual={() => setEditingVisual(true)} />;
  return (
    <section
      aria-labelledby="visual-title"
      className="relative h-[100dvh] max-h-[100dvh] min-w-0 overflow-hidden pt-10 [&>div]:h-full [&>div]:max-h-full"
    >
      <button type="button" className="absolute inset-x-0 top-0 z-50 h-10 border-b border-line bg-surface-raised px-4 text-left text-sm font-semibold text-accent"
        onClick={() => setEditingVisual(false)}>← Back to my posts</button>
      <h2 id="visual-title" className="sr-only">
        Visual studio editor
      </h2>
      <MiniCanvaEditor
        composition={composition}
        outputs={outputs}
        onRegenerateChannel={onRegenerateChannel}
        regenerationRemaining={regenerationRemaining}
        regenerationBusyChannel={regenerationBusyChannel}
        generationProvider={generationProvider}
        autoDesignStatus={autoDesignStatus}
        autoDesignWarning={autoDesignWarning}
        creativeDirections={creativeDirections}
        selectedCreativeId={selectedCreativeId}
        captureRef={captureRef}
        uploadStatus={uploadStatus}
        uploadError={uploadError}
        exportStatus={exportStatus}
        exportError={exportError}
        exportDownloadUrl={exportDownloadUrl}
        plan={plan}
        canExportLaunchKit={canExportLaunchKit}
        campaignsRemaining={campaignsRemaining}
        usagePeriodEndsAt={usagePeriodEndsAt}
        launchKitReadiness={launchKitReadiness}
        onChange={onChange}
        onOutputsChange={onOutputsChange}
        onSelectCreativeDirection={onSelectCreativeDirection}
        onUpload={onUpload}
        onAiRewrite={onAiRewrite}
        onAiDesign={onAiDesign}
        saveStatus={saveStatus}
        saveError={saveError}
        onSave={onSave}
        aiContext={aiContext}
        onExportPng={onExportPng}
        onExportZip={onExportZip}
      />
    </section>
  );
}
