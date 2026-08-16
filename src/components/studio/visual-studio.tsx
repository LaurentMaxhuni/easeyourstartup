"use client";

import type { RefObject } from "react";
import {
  MiniCanvaEditor,
  type CreativeAiContext,
} from "@/components/studio/mini-canva-editor";
import type {
  CreativeComposition,
  CreativeCodeBundle,
  ChannelOutput,
  CreativeDirection,
  CreativeDesignInput,
  CreativeDesignResult,
  CreativeMockupDevice,
  CreativeRewriteInput,
} from "@/lib/contracts";

export type VisualStudioProps = {
  composition: CreativeComposition;
  outputs: ChannelOutput[];
  generationProvider?: "groq" | "openrouter" | "openai" | "compatible";
  autoDesignStatus: "idle" | "loading" | "ai" | "error";
  autoDesignWarning?: string;
  creativeDirections: CreativeDirection[];
  selectedCreativeId: string;
  captureRef: RefObject<HTMLDivElement | null>;
  uploadStatus: "idle" | "loading" | "error";
  uploadError: string;
  exportStatus: "idle" | "loading";
  exportError: string;
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
    code: CreativeCodeBundle;
    mode: "ai";
    provider?: "groq" | "openrouter" | "openai" | "compatible";
  }>;
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  saveError: string;
  onSave: () => Promise<void>;
  aiContext: CreativeAiContext;
  onExportPng: () => Promise<void>;
  onExportZip: () => Promise<void>;
};

export function VisualStudio({
  composition,
  outputs,
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
}: VisualStudioProps) {
  return (
    <section
      aria-labelledby="visual-title"
      className="h-[100dvh] max-h-[100dvh] min-w-0 overflow-hidden"
    >
      <h2 id="visual-title" className="sr-only">
        Visual studio editor
      </h2>
      <MiniCanvaEditor
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
