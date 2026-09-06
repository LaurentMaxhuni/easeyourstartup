"use client";

import type { RefObject } from "react";
import {
  VisualStudio,
  type VisualStudioProps,
} from "@/components/studio/visual-studio";
import type { CreativeAiContext } from "@/components/studio/mini-canva-editor";
import type {
  ChannelOutput,
  CreativeComposition,
  CreativeDirection,
  CreativeMockupDevice,
} from "@/lib/contracts";
import type { LaunchKitReadiness } from "@/lib/launch-kit";

export function CreativeWorkspace({
  composition,
  outputs,
  generationProvider,
  autoDesignStatus,
  autoDesignWarning,
  captureRef,
  uploadStatus,
  uploadError,
  exportStatus,
  exportError,
  plan,
  canExportLaunchKit,
  campaignsRemaining,
  launchKitReadiness,
  creativeDirections,
  selectedCreativeId,
  onCompositionChange,
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
}: {
  composition: CreativeComposition;
  outputs: ChannelOutput[];
  generationProvider?: "groq" | "openrouter" | "openai" | "compatible";
  autoDesignStatus: "idle" | "loading" | "ai" | "error";
  autoDesignWarning?: string;
  captureRef: RefObject<HTMLDivElement | null>;
  uploadStatus: "idle" | "loading" | "error";
  uploadError: string;
  exportStatus: "idle" | "loading";
  exportError: string;
  plan: "free" | "pro";
  canExportLaunchKit: boolean;
  campaignsRemaining: number | null;
  launchKitReadiness: LaunchKitReadiness;
  creativeDirections: CreativeDirection[];
  selectedCreativeId: string;
  onCompositionChange: (composition: CreativeComposition) => void;
  onOutputsChange: (outputs: ChannelOutput[]) => void;
  onSelectCreativeDirection: (id: string) => void;
  onUpload: (
    file: File,
    target?: CreativeMockupDevice | "single",
  ) => Promise<string | null>;
  onAiRewrite: VisualStudioProps["onAiRewrite"];
  onAiDesign: VisualStudioProps["onAiDesign"];
  saveStatus: VisualStudioProps["saveStatus"];
  saveError: string;
  onSave: VisualStudioProps["onSave"];
  aiContext: CreativeAiContext;
  onExportPng: () => Promise<void>;
  onExportZip: () => Promise<void>;
}) {
  return (
    <VisualStudio
      composition={composition}
      outputs={outputs}
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
      plan={plan}
      canExportLaunchKit={canExportLaunchKit}
      campaignsRemaining={campaignsRemaining}
      launchKitReadiness={launchKitReadiness}
      onChange={onCompositionChange}
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
  );
}
