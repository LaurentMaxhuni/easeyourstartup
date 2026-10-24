"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AccountProfile } from "@/components/account/account-avatar-link";
import {
  creativeDesignResultSchema,
  generateJobResultSchema,
  scanJobResultSchema,
  studioStateSchema,
  type StudioState,
} from "@/lib/contracts";
import type {
  BrandProfile,
  ChannelOutput,
  CreativeComposition,
  CreativeDirection,
  CreativeDesignInput,
  CreativeRewriteInput,
  GenerationResult,
  ScanResult,
} from "@/lib/contracts";
import { DEMO_COMPOSITION } from "@/lib/demo-data";
import { BrandDnaPanel } from "@/components/studio/brand-dna-panel";
import {
  CampaignBuilder,
  type CampaignDraft,
} from "@/components/studio/campaign-builder";
import { CreativeWorkspace } from "@/components/studio/creative-workspace";
import {
  GenerationProgressScreen,
  type GenerationScreenStage,
} from "@/components/studio/generation-progress-screen";
import { ScanPanel } from "@/components/studio/scan-panel";
import { StudioContextBar } from "@/components/studio/studio-context-bar";
import {
  StepNav,
  type StudioStep,
} from "@/components/studio/step-nav";
import { StudioHeader } from "@/components/studio/studio-header";
import { compositionImageUrls, toExportableImageUrl } from "@/lib/studio-export";
import { applyCreativeDesign } from "@/lib/studio/editor-state";
import { getLaunchKitReadiness } from "@/lib/launch-kit";
import { parseDurableJobResult } from "@/lib/job-results";
import {
  CAMPAIGN_JOB_MAX_POLL_DURATION_MS,
  isRetryableJobPollingError,
  jobError,
  waitForCompletedJob,
  type DurableJob,
} from "@/lib/studio/job-polling";
import { OUTFIT_FONT_FAMILY } from "@/lib/typography";
import { normalizePublicWebsiteUrl } from "@/lib/url-input";
import { campaignDraftWithDefaults } from "@/lib/studio/campaign-defaults";
import { resolveGeneratedCreativeDesign } from "@/lib/generation-v2/design-canvas";

const EMPTY_DRAFT: CampaignDraft = {
  kind: "launch",
  goal: "",
  updateDetails: "",
  audience: "",
  launchDate: "",
  cta: "",
  angle: {
    id: "customer-outcome",
    title: "Lead with the customer outcome",
    summary: "Connect the update to a clear benefit while staying within the approved product facts.",
  },
  channels: ["x", "linkedin", "product_hunt"],
};
const DEFAULT_ANGLES = [EMPTY_DRAFT.angle];

const EMPTY_CANVAS_IMAGE = "/images/canvas-placeholder.svg";
const LEGACY_DEMO_IMAGES = new Set([
  "/images/studio-capture.png",
  "/images/studio-capture-mobile.png",
  "/images/founder-launch-studio.png",
]);

function blankComposition(): CreativeComposition {
  return {
    ...DEMO_COMPOSITION,
    id: "new-campaign-canvas",
    screenshotUrl: EMPTY_CANVAS_IMAGE,
    mockups: { desktop: EMPTY_CANVAS_IMAGE, tablet: EMPTY_CANVAS_IMAGE, phone: EMPTY_CANVAS_IMAGE },
    elements: undefined,
    designSource: undefined,
    text: {
      eyebrow: "",
      headline: "Your launch story",
      subheadline: "",
      body: "",
      cta: "",
      footer: "",
    },
  };
}

function storedAssetId(value: string) {
  try {
    const path = new URL(value, "https://easeyourstartup.invalid").pathname;
    const match = path.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function storeProjectImage(source: string, projectId: string) {
  let captureUrl = source;
  if (captureUrl.startsWith("/api/capture?")) {
    const parsed = new URL(captureUrl, window.location.origin);
    if (!parsed.searchParams.has("projectId")) parsed.searchParams.set("projectId", projectId);
    captureUrl = parsed.pathname + parsed.search;
  }
  const captured = await fetch(captureUrl, { cache: "no-store" });
  if (!captured.ok) throw new Error("Screenshot could not be loaded.");
  const blob = await captured.blob();
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(blob.type) || blob.size === 0 || blob.size > 10 * 1024 * 1024) {
    throw new Error("Screenshot must be a PNG, JPEG, or WebP image under 10 MB.");
  }
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  const form = new FormData();
  form.append("file", new File([blob], `product-screenshot.${extension}`, { type: blob.type }));
  form.append("projectId", projectId);
  const upload = await fetch("/api/uploads", { method: "POST", body: form });
  const result = await upload.json() as { url?: string; error?: string };
  if (!upload.ok || !result.url) throw new Error(result.error || "Screenshot could not be saved.");
  return result.url;
}

async function migrateEditorImages(state: StudioState) {
  if (!state.projectId) return { state, failed: false };
  const composition = state.composition;
  const sources = compositionImageUrls(composition);
  const replacements = new Map<string, string>();
  let failed = false;
  const actualSource = state.scan?.desktopCaptureUrl || state.brand?.imageUrl || state.brand?.logoUrl || "";
  for (const source of new Set(sources)) {
    if (!source || storedAssetId(source) || source === EMPTY_CANVAS_IMAGE) continue;
    let legacyDemo = false;
    try {
      legacyDemo = LEGACY_DEMO_IMAGES.has(new URL(source, "https://easeyourstartup.invalid").pathname);
    } catch {
      // Malformed legacy image references remain visible and can be replaced manually.
    }
    if (legacyDemo && state.scan?.mode === "live" && !actualSource) {
      replacements.set(source, EMPTY_CANVAS_IMAGE);
      continue;
    }
    const target = legacyDemo && state.scan?.mode === "live"
      ? toExportableImageUrl(actualSource, EMPTY_CANVAS_IMAGE)
      : /^https?:\/\//i.test(source) ? toExportableImageUrl(source, EMPTY_CANVAS_IMAGE) : source;
    if (target === EMPTY_CANVAS_IMAGE) {
      replacements.set(source, target);
      continue;
    }
    try {
      replacements.set(source, await storeProjectImage(target, state.projectId));
    } catch {
      failed = true;
      if (legacyDemo && state.scan?.mode === "live") replacements.set(source, EMPTY_CANVAS_IMAGE);
    }
  }
  if (replacements.size === 0) return { state, failed };
  const replace = (source: string) => replacements.get(source) ?? source;
  return {
    failed,
    state: {
      ...state,
      composition: {
        ...composition,
        screenshotUrl: replace(composition.screenshotUrl),
        mockups: {
          desktop: replace(composition.mockups.desktop),
          tablet: replace(composition.mockups.tablet),
          phone: replace(composition.mockups.phone),
        },
        elements: composition.elements?.map((element) => element.kind === "image" && element.src
          ? { ...element, src: replace(element.src) }
          : element),
      },
    },
  };
}

type StudioSaveStatus = "idle" | "saving" | "saved" | "local" | "error";
type AutoDesignStatus = "idle" | "loading" | "ai" | "error";
type StudioPlan = "free" | "pro_lite" | "pro";
type StudioEvent =
  | "scan_started"
  | "scan_completed"
  | "scan_failed"
  | "claims_approved"
  | "generation_started"
  | "generation_completed"
  | "generation_failed"
  | "export_started"
  | "export_completed"
  | "export_failed";
type StudioEventProperties = {
  channelCount?: number;
  sourcePageCount?: number;
  approvedClaimCount?: number;
  outputCount?: number;
  warningCount?: number;
  durationMs?: number;
  mode?: "durable" | "direct" | "demo";
  format?: "png" | "zip";
};
type RecoverableJob = {
  id: string;
  kind: "scan" | "generate" | "export";
  projectId: string;
  campaignId: string | null;
  regenerationChannel: string | null;
};

function parseStoredStudioState(value: string | null): StudioState | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const result = studioStateSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function trackStudioEvent(event: StudioEvent, properties: StudioEventProperties = {}) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
  }).catch(() => {
    // Instrumentation must never interrupt the founder's launch workflow.
  });
}

function projectNameForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "My project";
  } catch {
    return "My project";
  }
}

async function postWithNetworkRetry(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
    return fetch(url, init);
  }
}

function applyCreativeDirection(
  composition: CreativeComposition,
  direction: CreativeDirection,
): CreativeComposition {
  return {
    ...composition,
    templateId: "custom",
    graphic: "none",
    elements: undefined,
    designSource: undefined,
    text: {
      ...composition.text,
      eyebrow: direction.eyebrow,
      headline: direction.headline,
      subheadline: direction.subheadline,
      body: direction.body,
      cta: direction.cta,
      footer: direction.footer,
    },
  };
}

export function StudioShell({
  initialAuthenticated = true,
  profile,
}: {
  initialAuthenticated?: boolean;
  profile: AccountProfile;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startFresh = searchParams.get("new") === "1";
  const newCampaign = searchParams.get("newCampaign") === "1";
  const requestedProjectId = searchParams.get("projectId");
  const requestedCampaignId = searchParams.get("campaignId");
  const autoStarted = useRef(false);
  const hydrating = useRef(true);
  const storageKey = useRef<string | null>("easeyourstartup:guest-studio");
  const saveRevision = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pollingJobId = useRef<string | null>(null);
  const applyScanResultRef = useRef<(data: ScanResult, nextProjectId: string | null) => void>(() => {});
  const autoDesignRequest = useRef(0);
  const entitlementRequest = useRef(0);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<StudioStep>("scan");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobType, setJobType] = useState<"scan" | "generate" | "regenerate" | "export" | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [selectedCreativeId, setSelectedCreativeId] = useState("");
  const [outputs, setOutputs] = useState<ChannelOutput[]>([]);
  const [autoDesignStatus, setAutoDesignStatus] =
    useState<AutoDesignStatus>("idle");
  const [autoDesignWarning, setAutoDesignWarning] = useState("");
  const [composition, setComposition] =
    useState<CreativeComposition>(blankComposition);
  const [scanStatus, setScanStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [scanError, setScanError] = useState("");
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [generateError, setGenerateError] = useState("");
  const [generationScreenStage, setGenerationScreenStage] =
    useState<GenerationScreenStage>("preparing");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const [exportStatus, setExportStatus] = useState<"idle" | "loading">("idle");
  const [exportError, setExportError] = useState("");
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const exportStartedAt = useRef<number | null>(null);
  const exportOperation = useRef<{ signature: string; id: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<StudioSaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [plan, setPlan] = useState<StudioPlan>("free");
  const [canExportLaunchKit, setCanExportLaunchKit] = useState(false);
  const [campaignsRemaining, setCampaignsRemaining] = useState<number | null>(
    null,
  );
  const [usagePeriodEndsAt, setUsagePeriodEndsAt] = useState<string | null>(null);
  const [entitlementRefreshVersion, setEntitlementRefreshVersion] =
    useState(0);
  const [regenerationRemaining, setRegenerationRemaining] = useState<Partial<Record<ChannelOutput["channel"], number>>>({});
  const [regenerationBusyChannel, setRegenerationBusyChannel] = useState<ChannelOutput["channel"] | null>(null);

  const buildStudioState = useCallback((): StudioState => {
    return studioStateSchema.parse({
      step,
      projectId,
      campaignId,
      jobId,
      jobType,
      scan,
      brand,
      draft,
      generation,
      selectedCreativeId,
      outputs,
      composition,
    });
  }, [brand, campaignId, composition, draft, generation, jobId, jobType, outputs, projectId, scan, selectedCreativeId, step]);
  const buildStudioStateRef = useRef(buildStudioState);
  useEffect(() => { buildStudioStateRef.current = buildStudioState; }, [buildStudioState]);

  const persistStudioState = useCallback(
    async (options: { manual?: boolean; state?: StudioState } = {}) => {
      let state: StudioState;
      try {
        state = options.state ?? buildStudioState();
      } catch {
        setSaveStatus("error");
        setSaveError("This editor state could not be validated for saving.");
        return false;
      }

      if (storageKey.current) {
        try {
          const localKey = `${storageKey.current}:${state.projectId ?? "new"}:${state.campaignId ?? "draft"}`;
          window.localStorage.setItem(localKey, JSON.stringify(state));
        } catch {
          // The database save below is still useful when browser storage is blocked.
        }
      }

      if (options.manual) {
        setSaveStatus("saving");
        setSaveError("");
      }

      const save = saveQueue.current.then(async () => {
        const response = await fetch("/api/studio/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, expectedRevision: saveRevision.current }),
        });
        const result = await response.json() as { error?: string; revision?: number };
        if (!response.ok) throw new Error(result.error || "Database persistence is unavailable.");
        if (typeof result.revision === "number") saveRevision.current = result.revision;
        setSaveStatus("saved");
        setSaveError("");
      });
      saveQueue.current = save.catch(() => undefined);
      try {
        await save;
        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes("changed in another tab")) {
          setSaveStatus("error");
          setSaveError(error.message);
        } else if (storageKey.current) {
          setSaveStatus("local");
          setSaveError("Saved on this device. Account sync is unavailable.");
        } else {
          setSaveStatus("error");
          setSaveError("The account save service could not be reached.");
        }
        return false;
      }
    },
    [buildStudioState],
  );

  useEffect(() => {
    // Our own history update already has this scope in memory. Rehydrating it
    // races autosave and can replace its revision with an older database read.
    if (!hydrating.current && !startFresh && !newCampaign) {
      const current = buildStudioStateRef.current();
      if (current.projectId === requestedProjectId && current.campaignId === requestedCampaignId) return;
    }
    let cancelled = false;
    hydrating.current = true;
    saveRevision.current = null;

    async function hydrateStudioState() {
      let savedState: StudioState | null = null;
      let activeJob: RecoverableJob | null = null;
      let hasProjectBrand = false;
      let persistence: "database" | "local" = "local";
      const guestStorageKey = storageKey.current;
      try {
        const query = new URLSearchParams();
        if (requestedProjectId) query.set("projectId", requestedProjectId);
        if (requestedCampaignId) query.set("campaignId", requestedCampaignId);
        const response = await fetch(`/api/studio/state${query.size ? `?${query}` : ""}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            state?: unknown;
            storageKey?: string;
            persistence?: "database" | "local";
            revision?: number | null;
            activeJob?: unknown;
          };
          saveRevision.current = typeof data.revision === "number" ? data.revision : null;
          persistence = data.persistence === "database" ? "database" : "local";
          savedState = studioStateSchema.safeParse(data.state).success
            ? studioStateSchema.parse(data.state)
            : null;
          if (data.activeJob && typeof data.activeJob === "object") {
            const candidate = data.activeJob as Partial<RecoverableJob>;
            if (
              typeof candidate.id === "string" &&
              typeof candidate.projectId === "string" &&
              (candidate.kind === "scan" || candidate.kind === "generate" || candidate.kind === "export")
            ) {
              activeJob = {
                id: candidate.id,
                kind: candidate.kind,
                projectId: candidate.projectId,
                campaignId: typeof candidate.campaignId === "string" ? candidate.campaignId : null,
                regenerationChannel: typeof candidate.regenerationChannel === "string" ? candidate.regenerationChannel : null,
              };
            }
          }
          if (!savedState && guestStorageKey) {
            savedState = parseStoredStudioState(
              window.localStorage.getItem(`${guestStorageKey}:${requestedProjectId ?? "new"}:${requestedCampaignId ?? "draft"}`),
            );
          }
          if (typeof data.storageKey === "string" && data.storageKey.length <= 120) {
            storageKey.current = data.storageKey;
          }
        }
      } catch {
        // A local snapshot can still restore the editor when the API is unavailable.
      }

      if (!startFresh && !savedState && storageKey.current) {
        try {
          savedState = parseStoredStudioState(
            window.localStorage.getItem(`${storageKey.current}:${requestedProjectId ?? "new"}:${requestedCampaignId ?? "draft"}`),
          );
        } catch {
          savedState = null;
        }
      }

      if (activeJob && savedState && savedState.projectId !== activeJob.projectId) {
        savedState = null;
        saveRevision.current = null;
      }
      if (activeJob && savedState) {
        savedState = studioStateSchema.parse({
          ...savedState,
          projectId: activeJob.projectId,
          campaignId: activeJob.campaignId ?? savedState.campaignId,
          jobId: activeJob.id,
          jobType: activeJob.kind === "generate"
            ? activeJob.regenerationChannel ? "regenerate" : "generate"
            : activeJob.kind,
        });
      }

      if (!cancelled && startFresh && !activeJob) {
        setStep("scan");
        setProjectId(null);
        setCampaignId(null);
        setJobId(null);
        setJobType(null);
        setExportDownloadUrl(null);
        setExportError("");
        saveRevision.current = null;
        setScan(null);
        setBrand(null);
        setDraft(EMPTY_DRAFT);
        setGeneration(null);
        setSelectedCreativeId("");
        setOutputs([]);
        setAutoDesignStatus("idle");
        setAutoDesignWarning("");
        setComposition(blankComposition());
        setScanStatus("idle");
        setScanError("");
        setGenerateStatus("idle");
        setGenerateError("");
        setSaveStatus("idle");
        setSaveError("");
      } else if (!cancelled && savedState) {
        hasProjectBrand = Boolean(savedState.brand);
        setStep(savedState.step);
        setProjectId(savedState.projectId);
        setCampaignId(savedState.campaignId);
        setJobId(savedState.jobId);
        setJobType(savedState.jobType);
        setScan(savedState.scan);
        setBrand(
          savedState.brand
            ? {
                ...savedState.brand,
                claims: savedState.brand.claims.map((claim) => ({
                  ...claim,
                  approvalState:
                    claim.approvalState === "rejected" ? "rejected" : "approved",
                })),
              }
            : null,
        );
        setDraft(savedState.draft);
        setGeneration(savedState.generation);
        setSelectedCreativeId(savedState.selectedCreativeId);
        setOutputs(savedState.outputs);
        setAutoDesignStatus("idle");
        setAutoDesignWarning("");
        setComposition(savedState.composition);
        void migrateEditorImages(savedState).then((migrated) => {
          if (cancelled) return;
          if (migrated.state.composition !== savedState.composition) {
            setComposition(migrated.state.composition);
          }
          if (migrated.failed) {
            setExportError("A saved screenshot still needs to be uploaded before export. Your existing work remains available.");
          }
        });
        setSaveStatus(persistence === "database" ? "saved" : "local");
        setSaveError("");
      } else if (!cancelled && activeJob) {
        setProjectId(activeJob.projectId);
        setCampaignId(activeJob.campaignId);
        setJobId(activeJob.id);
        setJobType(activeJob.kind === "generate"
          ? activeJob.regenerationChannel ? "regenerate" : "generate"
          : activeJob.kind);
        setStep(activeJob.kind === "scan" ? "scan" : activeJob.kind === "generate" ? "campaign" : "creative");
        const recoveredUrl = new URLSearchParams({ projectId: activeJob.projectId });
        if (activeJob.campaignId) recoveredUrl.set("campaignId", activeJob.campaignId);
        window.history.replaceState(null, "", `/studio?${recoveredUrl}`);
        if (activeJob.kind === "generate") {
          try {
            const projectResponse = await fetch(`/api/projects/${activeJob.projectId}`, { cache: "no-store" });
            if (projectResponse.ok) {
              const project = await projectResponse.json() as { scan?: ScanResult };
              if (project.scan) {
                hasProjectBrand = true;
                setScan(project.scan);
                setBrand(project.scan.profile);
              }
            }
          } catch {
            // The generation job remains recoverable when project details can be reloaded.
          }
        }
      } else if (!cancelled && requestedProjectId) {
        setProjectId(requestedProjectId);
        setCampaignId(requestedCampaignId);
        saveRevision.current = null;
        try {
          const projectResponse = await fetch(`/api/projects/${requestedProjectId}`, { cache: "no-store" });
          if (projectResponse.ok) {
            const project = await projectResponse.json() as { scan?: ScanResult };
            if (project.scan) {
              hasProjectBrand = true;
              setScan(project.scan);
              setBrand(project.scan.profile);
              setStep("brand");
            }
          }
        } catch {
          // Keep the selected project so the customer can retry after reconnecting.
        }
      }

      if (!cancelled && newCampaign && requestedProjectId) {
        setProjectId(requestedProjectId);
        setCampaignId(null);
        setJobId(null);
        setJobType(null);
        setDraft(EMPTY_DRAFT);
        setGeneration(null);
        setSelectedCreativeId("");
        setOutputs([]);
        setComposition(blankComposition());
        setStep(hasProjectBrand ? "campaign" : "scan");
        setGenerateStatus("idle");
        setGenerateError("");
      }

      if (!cancelled) {
        if (newCampaign && requestedProjectId) {
          window.history.replaceState(null, "", `/studio?projectId=${encodeURIComponent(requestedProjectId)}`);
        }
        hydrating.current = false;
        setHydrated(true);
      }
    }

    void hydrateStudioState();
    return () => {
      cancelled = true;
    };
  }, [newCampaign, requestedCampaignId, requestedProjectId, startFresh]);

  useEffect(() => {
    if (!hydrated || !jobId || pollingJobId.current === jobId) return;
    let cancelled = false;
    pollingJobId.current = jobId;
    void waitForCompletedJob(
      jobId,
      jobType === "generate"
        ? (job) => {
            setGenerationScreenStage(
              job.status === "queued"
                ? "queued"
                : job.status === "completed" || job.progress >= 75
                  ? "visuals"
                  : "writing",
            );
          }
        : undefined,
      jobType === "generate" || jobType === "regenerate"
        ? CAMPAIGN_JOB_MAX_POLL_DURATION_MS
        : undefined,
    )
      .then(async (result) => {
        if (cancelled) return;
        if (jobType === "export") {
          setExportDownloadUrl(`/api/exports/${jobId}/download`);
          setExportStatus("idle");
          setExportError("");
          let payload: { format?: unknown } | null = result && typeof result === "object"
            ? result as { format?: unknown }
            : null;
          if (typeof result === "string") {
            try { payload = JSON.parse(result) as { format?: unknown }; } catch { payload = null; }
          }
          const format = payload && (payload.format === "png" || payload.format === "zip") ? payload.format : undefined;
          trackStudioEvent("export_completed", {
            format,
            durationMs: Date.now() - (exportStartedAt.current ?? Date.now()),
          });
          setJobId(null);
          setJobType(null);
          return;
        }
        if (jobType === "scan") {
          const scanResult = parseDurableJobResult(result, scanJobResultSchema).scan;
          applyScanResultRef.current(scanResult, projectId);
          setJobId(null);
          setJobType(null);
          setGenerateStatus("idle");
          setGenerateError("");
          return;
        }
        const generation = parseDurableJobResult(result, generateJobResultSchema).generation;
        if (jobType === "regenerate") {
          const replacement = generation.outputs[0];
          if (!replacement) throw new Error("The channel regeneration returned no copy.");
          setOutputs((current) => current.map((output) => output.channel === replacement.channel ? replacement : output));
          setGeneration((current) => current ? {
            ...current,
            outputs: current.outputs.map((output) => output.channel === replacement.channel ? replacement : output),
          } : current);
        } else {
          const firstDirection = generation.creativeDirections[0];
          const currentState = buildStudioStateRef.current();
          const generatedDesign = resolveGeneratedCreativeDesign(generation);
          const generatedComposition = generatedDesign
            ? applyCreativeDesign(currentState.composition, generatedDesign)
            : firstDirection ? applyCreativeDirection(currentState.composition, firstDirection) : currentState.composition;
          const migrated = await migrateEditorImages({ ...currentState, composition: generatedComposition });
          if (cancelled) return;
          setGeneration(generation);
          setOutputs(generation.outputs);
          setSelectedCreativeId(firstDirection?.id ?? "");
          setComposition(migrated.state.composition);
          setUploadStatus(migrated.failed ? "error" : "idle");
          setUploadError(migrated.failed ? "This image could not be saved. Try uploading it in Edit visual before downloading." : "");
        }
        setJobId(null);
        setJobType(null);
        setGenerateStatus("idle");
        setGenerateError("");
        setStep("creative");
        setEntitlementRefreshVersion((version) => version + 1);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (jobType === "export") {
          setExportStatus("idle");
          setExportError(error instanceof Error ? error.message : "Campaign export failed.");
          trackStudioEvent("export_failed", { durationMs: Date.now() - (exportStartedAt.current ?? Date.now()) });
        } else if (jobType === "scan") {
          setScanStatus("error");
          setScanError(error instanceof Error ? error.message : "The saved scan did not finish.");
        } else {
          setGenerateStatus("error");
          setGenerateError(error instanceof Error ? error.message : "Campaign generation failed.");
        }
        if (jobType !== "generate" || !isRetryableJobPollingError(error)) {
          setJobId(null);
          setJobType(null);
        }
      })
      .finally(() => {
        if (pollingJobId.current === jobId) pollingJobId.current = null;
      });
    return () => { cancelled = true; };
  }, [hydrated, jobId, jobType, projectId]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++entitlementRequest.current;

    async function loadEntitlements() {
      try {
        const response = await fetch("/api/entitlements", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          plan?: StudioPlan;
          canExportLaunchKit?: boolean;
          campaignsRemaining?: number;
          usagePeriodEndsAt?: string;
        };
        if (cancelled || requestId !== entitlementRequest.current) return;
        if (data.plan === "free" || data.plan === "pro_lite" || data.plan === "pro") {
          setPlan(data.plan);
          setCanExportLaunchKit(data.canExportLaunchKit === true);
        }
        if (
          typeof data.campaignsRemaining === "number" &&
          Number.isFinite(data.campaignsRemaining) &&
          data.campaignsRemaining >= 0
        ) {
          setCampaignsRemaining(data.campaignsRemaining);
        }
        if (typeof data.usagePeriodEndsAt === "string") setUsagePeriodEndsAt(data.usagePeriodEndsAt);
      } catch {
        // A failed lookup intentionally leaves the safer free preview state in place.
      }
    }

    void loadEntitlements();
    return () => {
      cancelled = true;
      entitlementRequest.current += 1;
    };
  }, [entitlementRefreshVersion]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    async function loadRegenerationAllowance() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/regenerate`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { remaining?: Partial<Record<ChannelOutput["channel"], number>> };
        if (!cancelled) setRegenerationRemaining(data.remaining ?? {});
      } catch {
        // API calls still enforce the authoritative allowance if this display is unavailable.
      }
    }
    void loadRegenerationAllowance();
    return () => { cancelled = true; };
  }, [campaignId, entitlementRefreshVersion]);

  useEffect(() => {
    if (!hydrated || hydrating.current) return;
    if (startFresh && !scan && !brand && !generation && !jobId) return;
    const timer = window.setTimeout(() => {
      void persistStudioState();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [brand, campaignId, composition, draft, generation, hydrated, jobId, jobType, outputs, persistStudioState, projectId, scan, selectedCreativeId, startFresh, step]);

  const applyScanResult = useCallback((data: ScanResult, nextProjectId: string | null) => {
    if (nextProjectId !== projectId) setCampaignId(null);
    setProjectId(nextProjectId);
    const withProjectCaptures = nextProjectId ? {
      ...data,
      desktopCaptureUrl: data.desktopCaptureUrl ? `${data.desktopCaptureUrl}&projectId=${encodeURIComponent(nextProjectId)}` : null,
      mobileCaptureUrl: data.mobileCaptureUrl ? `${data.mobileCaptureUrl}&projectId=${encodeURIComponent(nextProjectId)}` : null,
    } : data;
    setScan(withProjectCaptures);
    setBrand(data.profile);
    setGeneration(null);
    setOutputs([]);
    setSelectedCreativeId("");
    setDraft((current) => ({
      ...current,
      audience: data.profile.audience || current.audience,
      cta: data.profile.cta || current.cta,
    }));
    const scanImage = toExportableImageUrl(
      withProjectCaptures.desktopCaptureUrl ?? data.profile.imageUrl ?? data.profile.logoUrl,
      EMPTY_CANVAS_IMAGE,
    );
    setComposition((current) => ({
      ...current,
      elements: undefined,
      designSource: undefined,
      screenshotUrl: scanImage,
      mockups: {
        desktop: scanImage,
        tablet: scanImage,
        phone: scanImage,
      },
      tokens: {
        ...current.tokens,
        background:
          data.profile.visualSystem?.backgroundColor ??
          data.profile.colors[0] ??
          current.tokens.background,
        foreground:
          data.profile.visualSystem?.foregroundColor ?? current.tokens.foreground,
        accent:
          data.profile.visualSystem?.accentColor ??
          data.profile.colors[1] ??
          current.tokens.accent,
        fontFamily: OUTFIT_FONT_FAMILY,
        headingFontFamily: OUTFIT_FONT_FAMILY,
        bodyFontFamily: OUTFIT_FONT_FAMILY,
        radius: data.profile.visualSystem?.radius ?? current.tokens.radius ?? 8,
        spacing: data.profile.visualSystem?.spacing ?? current.tokens.spacing ?? 16,
        usesGradient:
          data.profile.visualSystem?.usesGradient ?? current.tokens.usesGradient ?? false,
      },
      text: {
        ...current.text,
        eyebrow: data.profile.projectName,
        headline: data.profile.tagline || current.text.headline,
        cta: data.profile.cta || current.text.cta,
      },
    }));
    const imageCandidates = Array.from(new Set([
      withProjectCaptures.desktopCaptureUrl ? scanImage : "",
      data.profile.imageUrl ? toExportableImageUrl(data.profile.imageUrl, EMPTY_CANVAS_IMAGE) : "",
      data.profile.logoUrl ? toExportableImageUrl(data.profile.logoUrl, EMPTY_CANVAS_IMAGE) : "",
    ].filter((source) => source && source !== EMPTY_CANVAS_IMAGE)));
    if (nextProjectId && imageCandidates.length > 0 && !storedAssetId(scanImage)) {
      setUploadStatus("loading");
      setUploadError("");
      void (async () => {
        let storedUrl: string | null = null;
        for (const candidate of imageCandidates) {
          try {
            storedUrl = await storeProjectImage(candidate, nextProjectId);
            break;
          } catch {
            // Try the source image if the managed browser capture is unavailable.
          }
        }
        if (storedUrl) {
          setComposition((current) => current.screenshotUrl !== scanImage ? current : ({
            ...current,
            screenshotUrl: storedUrl,
            mockups: { desktop: storedUrl, tablet: storedUrl, phone: storedUrl },
          }));
          setUploadStatus("idle");
        } else {
          setComposition((current) => current.screenshotUrl !== scanImage ? current : ({
            ...current,
            screenshotUrl: EMPTY_CANVAS_IMAGE,
            mockups: { desktop: EMPTY_CANVAS_IMAGE, tablet: EMPTY_CANVAS_IMAGE, phone: EMPTY_CANVAS_IMAGE },
          }));
          setUploadStatus("error");
          setUploadError("A product screenshot could not be captured or saved. Upload one before exporting.");
        }
      })();
    }
    setScanStatus("success");
    setStep("brand");
    if (startFresh) {
      window.history.replaceState(null, "", nextProjectId
        ? `/studio?projectId=${encodeURIComponent(nextProjectId)}`
        : "/studio");
    }
  }, [projectId, startFresh]);
  applyScanResultRef.current = applyScanResult;

  const runScan = useCallback(async (url?: string) => {
    const normalized = normalizePublicWebsiteUrl(url ?? "");
    if (!normalized) {
      setScanStatus("error");
      setScanError("Enter a valid public HTTP or HTTPS website.");
      return;
    }

    setScanStatus("loading");
    setScanError("");
    setScanPreviewUrl(null);
    const startedAt = Date.now();
    trackStudioEvent("scan_started", {
      mode: initialAuthenticated ? "durable" : "direct",
    });
    let activeJobId: string | null = null;
    try {
      let data: ScanResult;
      let resolvedProjectId: string | null = null;
      let mode: "durable" | "direct" = "direct";
      if (normalized && initialAuthenticated) {
        const operationId = crypto.randomUUID();
        const response = await postWithNetworkRetry("/api/jobs/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
          body: JSON.stringify({
            url: normalized,
            projectName: projectNameForUrl(normalized),
            projectId: projectId ?? undefined,
          }),
        });
        const queued = (await response.json()) as {
          job?: DurableJob;
          projectId?: string;
          error?: string;
        };
        if (response.ok) {
          if (!queued.job?.id || !queued.projectId) {
            throw new Error("The scan job did not return its workspace details.");
          }
          activeJobId = queued.job.id;
          resolvedProjectId = queued.projectId;
          pollingJobId.current = activeJobId;
          setProjectId(queued.projectId);
          setJobId(activeJobId);
          setJobType("scan");
          setScanPreviewUrl(`/api/capture?target=${encodeURIComponent(normalized)}&viewport=desktop&projectId=${encodeURIComponent(queued.projectId)}`);
          window.history.replaceState(null, "", `/studio?projectId=${encodeURIComponent(queued.projectId)}`);
          const recoveryState = studioStateSchema.parse({
            ...buildStudioState(),
            projectId: queued.projectId,
            jobId: activeJobId,
            jobType: "scan",
            step: "scan",
          });
          await persistStudioState({ state: recoveryState });
          const result = await waitForCompletedJob(queued.job.id);
          data = parseDurableJobResult(result, scanJobResultSchema).scan;
        } else if (
          response.status === 503 &&
          queued.error === "Durable jobs are not configured."
        ) {
          const directResponse = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: normalized,
              projectName: projectNameForUrl(normalized),
              projectId: projectId ?? undefined,
            }),
          });
          const direct = (await directResponse.json()) as ScanResult & {
            error?: string;
            projectId?: string;
          };
          if (!directResponse.ok) throw new Error(direct.error || "Scan failed.");
          data = direct;
          resolvedProjectId = direct.projectId ?? null;
          mode = "direct";
        } else {
          throw new Error(jobError(queued, "Scan failed."));
        }
      } else {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: normalized,
            projectName: projectNameForUrl(normalized),
            projectId: projectId ?? undefined,
          }),
        });
        const direct = (await response.json()) as ScanResult & {
          error?: string;
          projectId?: string;
        };
        if (!response.ok) throw new Error(direct.error || "Scan failed.");
        data = direct;
        resolvedProjectId = direct.projectId ?? null;
      }
      applyScanResult(data, resolvedProjectId);
      setJobId(null);
      setJobType(null);
      trackStudioEvent("scan_completed", {
        mode,
        sourcePageCount: data.pages.length,
        approvedClaimCount: data.profile.claims.filter(
          (claim) => claim.approvalState !== "rejected",
        ).length,
        warningCount: data.warnings.length,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setScanStatus("error");
      const message = error instanceof Error ? error.message : "Scan failed.";
      setScanError(message);
      if (activeJobId && !message.includes("taking longer")) {
        setJobId(null);
        setJobType(null);
      }
      trackStudioEvent("scan_failed", {
        mode: projectId ? "durable" : "direct",
        durationMs: Date.now() - startedAt,
      });
    } finally {
      if (pollingJobId.current === activeJobId) pollingJobId.current = null;
    }
  }, [applyScanResult, buildStudioState, initialAuthenticated, persistStudioState, projectId]);

  useEffect(() => {
    if (!hydrated || autoStarted.current) return;
    const url = searchParams.get("url");
    if (url) {
      autoStarted.current = true;
      const timer = window.setTimeout(
        () => void runScan(url),
        0,
      );
      return () => window.clearTimeout(timer);
    }
  }, [hydrated, runScan, searchParams]);

  async function runAutomaticDesign(
    baseComposition: CreativeComposition,
    profile: BrandProfile,
    campaignDraft: CampaignDraft,
    requestedRequestId?: number,
    targetCampaignId: string | null = campaignId,
    copyCandidates: string[] = [],
  ) {
    const requestId = requestedRequestId ?? autoDesignRequest.current + 1;
    autoDesignRequest.current = Math.max(autoDesignRequest.current, requestId);
    const result = await designCreativeComposition(
      {
        projectName: profile.projectName,
        context: [
          profile.tagline,
          `Audience: ${campaignDraft.audience}`,
          `Campaign goal: ${campaignDraft.goal}`,
          `Update: ${campaignDraft.updateDetails}`,
        ]
          .filter(Boolean)
          .join("\n"),
        approvedFacts: profile.claims
          .filter((claim) => claim.approvalState === "approved")
          .map((claim) => claim.text),
        brand: profile,
        copyCandidates: [profile.projectName, profile.tagline, ...copyCandidates].filter(
          (value) => value.trim().length > 0,
        ),
        instruction:
          "Recompose this canvas as a complete, editable design based on the brand identity and selected campaign copy. Choose the visual structure, typography, colors, imagery, and icons from scratch.",
        composition: baseComposition,
      },
      requestId,
      targetCampaignId,
    );
    if (requestId !== autoDesignRequest.current) return;
    setComposition({
      ...applyCreativeDesign(baseComposition, result.design),
      designSource: "ai",
    });
  }

  async function runGeneration() {
    if (!brand) return;
    const readyDraft = campaignDraftWithDefaults(draft, brand);
    setDraft(readyDraft);
    if (readyDraft.goal.trim().length < 8 || draft.updateDetails.trim().length < 8) {
      setGenerateStatus("error");
      setGenerateError("Tell us what’s new in at least a few words.");
      return;
    }
    if (readyDraft.audience.trim().length < 2) {
      setGenerateStatus("error");
      setGenerateError("Add a target audience (at least 2 characters).");
      return;
    }
    if (!readyDraft.cta.trim()) {
      setGenerateStatus("error");
      setGenerateError("Add a call to action for readers.");
      return;
    }
    if (draft.channels.length === 0) {
      setGenerateStatus("error");
      setGenerateError("Select at least one channel.");
      return;
    }
    if (!initialAuthenticated) {
      setGenerateStatus("idle");
      setGenerateError("");
      await persistStudioState({ manual: true });
      router.push(`/login?next=${encodeURIComponent("/studio")}`);
      return;
    }

    setGenerateStatus("loading");
    setGenerateError("");
    setGenerationScreenStage("preparing");
    const requestId = autoDesignRequest.current + 1;
    autoDesignRequest.current = requestId;
    setAutoDesignStatus("idle");
    setAutoDesignWarning("");
    const startedAt = Date.now();
    let activeJobId: string | null = null;
    trackStudioEvent("generation_started", {
      channelCount: draft.channels.length,
      approvedClaimCount: brand.claims.filter(
        (claim) => claim.approvalState !== "rejected",
      ).length,
      mode: projectId ? "durable" : "direct",
    });
    try {
      const campaign = {
        brand,
        kind: draft.kind,
        goal: readyDraft.goal,
        updateDetails: draft.updateDetails,
        audience: readyDraft.audience,
        launchDate: draft.launchDate,
        cta: readyDraft.cta,
        angle: draft.angle,
        channels: draft.channels,
      };
      let data: GenerationResult;
      let generatedCampaignId: string | null = campaignId;
      const mode: "durable" | "direct" = projectId ? "durable" : "direct";
      if (projectId) {
        const resumableJobId = jobType === "generate" ? jobId : null;
        if (resumableJobId) {
          activeJobId = resumableJobId;
          pollingJobId.current = resumableJobId;
          const result = await waitForCompletedJob(resumableJobId, (job) => {
            setGenerationScreenStage(
              job.status === "queued"
                ? "queued"
                : job.status === "completed" || job.progress >= 75
                  ? "visuals"
                  : "writing",
            );
          }, CAMPAIGN_JOB_MAX_POLL_DURATION_MS);
          data = parseDurableJobResult(result, generateJobResultSchema).generation;
        } else {
          const operationId = crypto.randomUUID();
          const response = await postWithNetworkRetry("/api/jobs/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
            body: JSON.stringify({ projectId, campaign }),
          });
          const queued = (await response.json()) as {
            job?: DurableJob;
            campaignId?: string;
            error?: string;
          };
          if (!response.ok) throw new Error(jobError(queued, "Campaign generation failed."));
          if (!queued.job?.id) {
            throw new Error("The campaign job did not return an id.");
          }
          if (!queued.campaignId) throw new Error("The campaign job did not return its campaign id.");
          activeJobId = queued.job.id;
          pollingJobId.current = activeJobId;
          saveRevision.current = null;
          const campaignUrl = new URLSearchParams({ projectId, campaignId: queued.campaignId });
          window.history.replaceState(null, "", `/studio?${campaignUrl}`);
          setCampaignId(queued.campaignId);
          generatedCampaignId = queued.campaignId;
          setJobId(activeJobId);
          setJobType("generate");
          const result = await waitForCompletedJob(activeJobId, (job) => {
            setGenerationScreenStage(
              job.status === "queued"
                ? "queued"
                : job.status === "completed" || job.progress >= 75
                  ? "visuals"
                  : "writing",
            );
          }, CAMPAIGN_JOB_MAX_POLL_DURATION_MS);
          data = parseDurableJobResult(result, generateJobResultSchema).generation;
        }
      } else {
        throw new Error("Save this project before generating a campaign.");
      }
      setGeneration(data);
      setOutputs(data.outputs);
      setJobId(null);
      setJobType(null);
      pollingJobId.current = null;
      if (mode === "durable") {
        setEntitlementRefreshVersion((version) => version + 1);
      }
      const firstDirection = data.creativeDirections[0];
      setGenerationScreenStage("visuals");
      setSelectedCreativeId(firstDirection?.id ?? "");
      let nextComposition = composition;
      if (firstDirection) {
        nextComposition = applyCreativeDirection(composition, firstDirection);
      } else {
        nextComposition = {
          ...composition,
          text: {
            ...composition.text,
            headline: brand.tagline || draft.updateDetails.split(".")[0],
            cta: draft.cta,
            eyebrow: brand.projectName,
          },
        };
      }
      const generatedDesign = resolveGeneratedCreativeDesign(data);
      if (generatedDesign) {
        let designedComposition = applyCreativeDesign(composition, generatedDesign);
        if (projectId) {
          const migrated = await migrateEditorImages({
            ...buildStudioState(),
            campaignId: generatedCampaignId,
            composition: designedComposition,
          });
          designedComposition = migrated.state.composition;
          setUploadStatus(migrated.failed ? "error" : "idle");
          setUploadError(
            migrated.failed
              ? "Some brand images could not be saved to this project. They remain on the canvas, but may not export until replaced."
              : "",
          );
        }
        setComposition({
          ...designedComposition,
          designSource: "ai",
        });
      } else {
        setComposition(nextComposition);
        void runAutomaticDesign(
          nextComposition,
          brand,
          draft,
          requestId,
          generatedCampaignId,
          firstDirection
            ? [
                firstDirection.eyebrow,
                firstDirection.headline,
                firstDirection.subheadline,
                firstDirection.body,
                firstDirection.cta,
                firstDirection.footer,
              ].filter((value) => value.trim().length > 0)
            : [],
        ).catch(() => undefined);
      }
      setGenerateStatus("idle");
      setStep("creative");
      trackStudioEvent("generation_completed", {
        mode,
        channelCount: data.outputs.length,
        approvedClaimCount: brand.claims.filter(
          (claim) => claim.approvalState !== "rejected",
        ).length,
        warningCount: data.outputs.reduce(
          (count, output) => count + output.warnings.length,
          0,
        ),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      pollingJobId.current = null;
      if (!activeJobId || !isRetryableJobPollingError(error)) {
        setJobId(null);
        setJobType(null);
      }
      setGenerateStatus("error");
      setGenerateError(
        error instanceof Error ? error.message : "Campaign generation failed.",
      );
      trackStudioEvent("generation_failed", {
        mode: projectId ? "durable" : "direct",
        channelCount: draft.channels.length,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  async function selectCreativeDirection(id: string) {
    const direction = generation?.creativeDirections.find(
      (candidate) => candidate.id === id,
    );
    if (!direction) return;
    const requestId = autoDesignRequest.current + 1;
    autoDesignRequest.current = requestId;
    setAutoDesignStatus("idle");
    setAutoDesignWarning("");
    setSelectedCreativeId(id);
    const nextComposition = applyCreativeDirection(composition, direction);
    if (autoDesignRequest.current !== requestId) return;
    if (!brand) {
      setComposition(nextComposition);
      return;
    }
    void runAutomaticDesign(
      nextComposition,
      brand,
      draft,
      requestId,
      campaignId,
      [
        direction.eyebrow,
        direction.headline,
        direction.subheadline,
        direction.body,
        direction.cta,
        direction.footer,
      ].filter((value) => value.trim().length > 0),
    ).catch(() => undefined);
  }

  function handleCompositionChange(nextComposition: CreativeComposition) {
    // Any direct editor edit supersedes a pending automatic design response.
    // The response can still finish in the background, but it must not replace
    // the user's newer canvas state when it arrives.
    autoDesignRequest.current += 1;
    setAutoDesignStatus("idle");
    setAutoDesignWarning("");
    setComposition(nextComposition);
  }

  async function uploadScreenshot(
    file: File,
  ): Promise<string | null> {
    setUploadStatus("loading");
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (projectId) form.append("projectId", projectId);
      if (campaignId) form.append("campaignId", campaignId);
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Upload failed.");
      }
      const uploadedUrl = data.url;
      setUploadStatus("idle");
      return uploadedUrl;
    } catch {
      setUploadStatus("error");
      setUploadError("The image could not be uploaded. Try a PNG, JPEG, or WebP.");
      return null;
    }
  }

  async function rewriteCreativeText(input: CreativeRewriteInput) {
    if (!projectId || !campaignId) throw new Error("Save this campaign before using AI rewrite.");
    const response = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, projectId, campaignId }),
    });
    const data = (await response.json()) as {
      text?: string;
      mode?: "ai";
      error?: string;
    };
    if (!response.ok || !data.text || data.mode !== "ai") {
      throw new Error(data.error || "AI rewrite failed.");
    }
    return { text: data.text, mode: "ai" as const };
  }

  async function designCreativeComposition(
    input: CreativeDesignInput,
    requestId = autoDesignRequest.current + 1,
    targetCampaignId: string | null = campaignId,
  ) {
    if (!projectId || !targetCampaignId) throw new Error("Save this campaign before using AI design.");
    const designBrand = input.brand ?? brand;
    const brandIdentity = designBrand
      ? {
          projectName: designBrand.projectName,
          tagline: designBrand.tagline,
          voice: designBrand.voice,
          colors: designBrand.colors,
          fonts: designBrand.fonts,
          fontAssets: designBrand.fontAssets,
          logoUrl: designBrand.logoUrl,
          faviconUrl: designBrand.faviconUrl,
          imageUrl: designBrand.imageUrl,
          visualSystem: designBrand.visualSystem,
          productScreenshotCandidates: designBrand.productScreenshotCandidates,
          brandIntelligence: designBrand.brandIntelligence,
        }
      : undefined;
    autoDesignRequest.current = Math.max(autoDesignRequest.current, requestId);
    if (requestId === autoDesignRequest.current) {
      setAutoDesignStatus("loading");
      setAutoDesignWarning("");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 165_000);
    try {
      const response = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, brand: brandIdentity, projectId, campaignId: targetCampaignId }),
        signal: controller.signal,
      });
      const body = await response.text();
      let data: {
        design?: unknown;
        mode?: "ai";
        provider?: "groq" | "nvidia-nim" | "openrouter" | "openai" | "compatible";
        error?: string;
      };
      try {
        data = JSON.parse(body) as typeof data;
      } catch {
        throw new Error(
          `AI design returned an invalid server response (${response.status}).`,
        );
      }
      if (!response.ok || !data.design || data.mode !== "ai") {
        throw new Error(data.error || `AI design failed (${response.status}).`);
      }
      if (requestId === autoDesignRequest.current) {
        setAutoDesignStatus("ai");
        setAutoDesignWarning("");
      }
      return {
        design: creativeDesignResultSchema.parse(data.design),
        mode: data.mode,
        provider: data.provider,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (requestId === autoDesignRequest.current) {
          setAutoDesignStatus("error");
          setAutoDesignWarning("AI design timed out before a scene was returned.");
        }
        throw new Error("AI design timed out. No canvas was generated.");
      }
      if (requestId === autoDesignRequest.current) {
        setAutoDesignStatus("error");
        setAutoDesignWarning(
          error instanceof Error ? error.message : "AI design failed.",
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  useEffect(() => {
    const main = document.getElementById("studio-content");
    if (!main || step === "scan") return;
    const timer = window.setTimeout(
      () => main.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [step]);

  async function regenerateChannel(channel: ChannelOutput["channel"]) {
    if (!campaignId) throw new Error("Save or generate this campaign before regenerating channel copy.");
    if (plan === "free") throw new Error("Channel regeneration is available on Pro.");
    setRegenerationBusyChannel(channel);
    let activeJobId: string | null = null;
    try {
      const operationId = crypto.randomUUID();
      const response = await postWithNetworkRetry(`/api/campaigns/${campaignId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": operationId },
        body: JSON.stringify({ channel }),
      });
      const queued = await response.json() as { job?: DurableJob; error?: string };
      if (!response.ok || !queued.job?.id) throw new Error(queued.error || "Channel regeneration could not be queued.");
      activeJobId = queued.job.id;
      pollingJobId.current = activeJobId;
      setJobId(activeJobId);
      setJobType("regenerate");
      const result = await waitForCompletedJob(activeJobId, undefined, CAMPAIGN_JOB_MAX_POLL_DURATION_MS);
      const generation = parseDurableJobResult(result, generateJobResultSchema).generation;
      const replacement = generation.outputs.find((output) => output.channel === channel);
      if (!replacement) throw new Error("The provider returned no replacement for this channel.");
      setOutputs((current) => current.map((output) => output.channel === channel ? replacement : output));
      setGeneration((current) => current ? {
        ...current,
        outputs: current.outputs.map((output) => output.channel === channel ? replacement : output),
      } : current);
      setJobId(null);
      setJobType(null);
      setGenerateError("");
      setEntitlementRefreshVersion((version) => version + 1);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("taking longer")) {
        if (activeJobId) {
          setJobId(null);
          setJobType(null);
        }
      }
      throw error;
    } finally {
      if (pollingJobId.current === activeJobId) pollingJobId.current = null;
      setRegenerationBusyChannel(null);
    }
  }

  async function exportSavedCampaign(format: "png" | "zip") {
    if (!canExportLaunchKit) {
      setExportError(format === "png"
        ? "Upgrade to Pro to download an unwatermarked launch visual."
        : "Upgrade to Pro to download the full launch kit.");
      return;
    }
    if (!projectId || !campaignId || !brand) {
      setExportError("Save a completed campaign before exporting.");
      return;
    }
    const outputCount = outputs.length;
    const approvedClaimCount = brand.claims.filter(
      (claim) => claim.approvalState !== "rejected",
    ).length;
    setExportStatus("loading");
    setExportError("");
    setExportDownloadUrl(null);
    const startedAt = Date.now();
    trackStudioEvent("export_started", { outputCount, approvedClaimCount, format });
    try {
      const saved = await persistStudioState({ manual: true });
      if (!saved || saveRevision.current === null) {
        throw new Error("Save this campaign before exporting.");
      }
      const signature = `${format}:${projectId}:${campaignId}:${saveRevision.current}`;
      if (!exportOperation.current || exportOperation.current.signature !== signature) {
        exportOperation.current = { signature, id: crypto.randomUUID() };
      }
      const response = await postWithNetworkRetry("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": exportOperation.current.id },
        body: JSON.stringify({
          format,
          projectId,
          campaignId,
          expectedRevision: saveRevision.current,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The saved campaign could not be exported. Please retry.");
      }
      const queued = await response.json() as { job?: DurableJob; error?: string };
      if (!queued.job?.id) throw new Error(queued.error || "The export could not be queued.");
      exportOperation.current = null;
      exportStartedAt.current = startedAt;
      setJobId(queued.job.id);
      setJobType("export");
      setExportStatus("loading");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The campaign could not be exported. Please retry.");
      setExportStatus("idle");
    }
  }

  async function exportPng() {
    await exportSavedCampaign("png");
  }

  async function exportZip() {
    await exportSavedCampaign("zip");
  }

  const available: StudioStep[] = [
    "scan",
    ...(scan ? (["brand", "campaign"] as StudioStep[]) : []),
    ...(generation ? (["creative"] as StudioStep[]) : []),
  ];
  const compositionImageRefs = compositionImageUrls(composition);
  const hasDurableCompositionImages = compositionImageRefs.every((source) => storedAssetId(source) !== null);
  const launchKitReadiness = brand
    ? (() => {
        const readiness = getLaunchKitReadiness({ brand, draft, outputs, composition, scan });
        const warnings = hasDurableCompositionImages
          ? readiness.warnings
          : ["Upload or capture a product screenshot so it is saved privately before exporting.", ...readiness.warnings];
        return { ...readiness, ready: readiness.ready && hasDurableCompositionImages, warnings: [...new Set(warnings)] };
      })()
    : {
        ready: false,
        approvedClaimCount: 0,
        outputCount: 0,
        warnings: ["Scan a product before creating a launch kit."],
      };

  if (
    step === "campaign" &&
    (generateStatus === "loading" ||
      (generateStatus === "idle" && jobType === "generate" && jobId !== null)) &&
    jobType !== "regenerate"
  ) {
    return (
      <GenerationProgressScreen
        projectName={brand?.projectName ?? "Your launch"}
        channelCount={draft.channels.length}
        stage={generationScreenStage}
      />
    );
  }

  return (
    <div
      className={
        step === "creative"
          ? "h-[100dvh] max-h-[100dvh] overflow-hidden bg-canvas"
          : "min-h-screen bg-canvas"
      }
    >
      {step !== "creative" && (
        <>
          <StudioHeader profile={profile} plan={plan} />
          <StepNav current={step} available={available} onChange={setStep} />
          {step !== "scan" && scan && brand && (
            <StudioContextBar
              stage={step}
              projectName={brand.projectName}
              sourceUrl={scan.pages[0]?.url ?? ""}
              approvedClaims={
                brand.claims.filter(
                  (claim) => claim.approvalState !== "rejected",
                ).length
              }
              totalClaims={brand.claims.length}
              selectedChannels={draft.channels.length}
              generatedOutputs={outputs.length}
            />
          )}
        </>
      )}
      <main
        id="studio-content"
        tabIndex={-1}
        className={
          step === "creative"
            ? "h-[100dvh] max-h-[100dvh] overflow-hidden"
            : undefined
        }
      >
        {step === "scan" && (
          <ScanPanel
            status={jobType === "scan" && jobId && scanStatus === "idle" ? "loading" : scanStatus}
            error={scanError}
            result={scan}
            previewUrl={scanPreviewUrl}
            onScan={runScan}
          />
        )}
        {step === "brand" && scan && brand && (
          <BrandDnaPanel
            scan={scan}
            brand={brand}
            onChange={setBrand}
            onBack={() => setStep("scan")}
            onContinue={() => setStep("campaign")}
          />
        )}
        {step === "campaign" && brand && (
          <CampaignBuilder
            draft={campaignDraftWithDefaults(draft, brand)}
            angles={generation?.angles ?? DEFAULT_ANGLES}
            status={(jobType === "generate" || jobType === "regenerate") && jobId && generateStatus === "idle" ? "loading" : generateStatus}
            error={generateError}
            resumePendingJob={jobType === "generate" && jobId !== null && generateStatus === "error"}
            isAuthenticated={initialAuthenticated}
            onChange={setDraft}
            onBack={() => setStep("brand")}
            onGenerate={runGeneration}
          />
        )}
        {step === "creative" && generation && brand && (
          <CreativeWorkspace
            composition={composition}
            outputs={outputs}
            onRegenerateChannel={regenerateChannel}
            regenerationRemaining={regenerationRemaining}
            regenerationBusyChannel={regenerationBusyChannel}
            generationProvider={generation.provider}
            autoDesignStatus={autoDesignStatus}
            autoDesignWarning={autoDesignWarning}
            captureRef={captureRef}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
            exportStatus={jobType === "export" && jobId && !exportDownloadUrl && !exportError ? "loading" : exportStatus}
            exportError={exportError}
            exportDownloadUrl={exportDownloadUrl}
            plan={plan}
            canExportLaunchKit={canExportLaunchKit}
            campaignsRemaining={campaignsRemaining}
            usagePeriodEndsAt={usagePeriodEndsAt}
            launchKitReadiness={launchKitReadiness}
            creativeDirections={generation.creativeDirections}
            selectedCreativeId={selectedCreativeId}
            onCompositionChange={handleCompositionChange}
            onOutputsChange={setOutputs}
            onSelectCreativeDirection={selectCreativeDirection}
            onUpload={uploadScreenshot}
            onAiRewrite={rewriteCreativeText}
            onAiDesign={designCreativeComposition}
            saveStatus={saveStatus}
            saveError={saveError}
            onSave={async () => { await persistStudioState({ manual: true }); }}
            aiContext={{
              projectName: brand.projectName,
              context: [
                brand.tagline,
                `Audience: ${draft.audience}`,
                `Campaign goal: ${draft.goal}`,
                `Update: ${draft.updateDetails}`,
              ]
                .filter(Boolean)
                .join("\n"),
              approvedFacts: brand.claims
                .filter((claim) => claim.approvalState !== "rejected")
                .map((claim) => claim.text),
              approvedClaims: brand.claims.filter(
                (claim) => claim.approvalState !== "rejected",
              ),
            }}
            onExportPng={exportPng}
            onExportZip={exportZip}
          />
        )}
      </main>
    </div>
  );
}
