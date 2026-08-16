"use client";

import {
  CheckCircle,
  GlobeSimple,
  Images,
  NotePencil,
} from "@phosphor-icons/react";
import type { StudioStageId } from "@/lib/studio-flow";
import { getStudioProgress, STUDIO_STAGES } from "@/lib/studio-flow";

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function StudioContextBar({
  stage,
  projectName,
  sourceUrl,
  approvedClaims,
  totalClaims,
  selectedChannels,
  generatedOutputs,
}: {
  stage: StudioStageId;
  projectName: string;
  sourceUrl: string;
  approvedClaims: number;
  totalClaims: number;
  selectedChannels: number;
  generatedOutputs: number;
}) {
  const progress = getStudioProgress(stage);
  const stageDetails =
    STUDIO_STAGES.find((item) => item.id === stage) ?? STUDIO_STAGES[0];

  return (
    <div
      aria-label="Current campaign context"
      className="border-b border-line bg-surface-raised"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
            <GlobeSimple size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{projectName}</p>
            <p className="truncate text-xs text-muted">
              {hostFromUrl(sourceUrl)}
            </p>
          </div>
          <span className="hidden h-8 w-px bg-line lg:block" />
          <div className="hidden min-w-0 lg:block">
            <p className="text-xs font-semibold">{stageDetails.label}</p>
            <p className="text-xs text-muted">{stageDetails.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-line border-y border-line py-2 lg:min-w-[420px] lg:border-y-0 lg:py-0">
          <div className="flex items-center gap-2 px-3 first:pl-0">
            <CheckCircle className="shrink-0 text-accent" size={16} />
            <span>
              <span className="block font-sans text-xs font-semibold">
                {approvedClaims}/{totalClaims}
              </span>
              <span className="block text-[10px] text-muted">facts</span>
            </span>
          </div>
          <div className="flex items-center gap-2 px-3">
            <NotePencil className="shrink-0 text-accent" size={16} />
            <span>
              <span className="block font-sans text-xs font-semibold">
                {selectedChannels}
              </span>
              <span className="block text-[10px] text-muted">channels</span>
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 last:pr-0">
            <Images className="shrink-0 text-accent" size={16} />
            <span>
              <span className="block font-sans text-xs font-semibold">
                {generatedOutputs}
              </span>
              <span className="block text-[10px] text-muted">posts</span>
            </span>
          </div>
        </div>

        <p className="hidden shrink-0 text-right font-sans text-[10px] uppercase tracking-[0.12em] text-muted xl:block">
          {progress.current} of {progress.total}
        </p>
      </div>
    </div>
  );
}
