"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AccountProfile } from "@/components/account/account-avatar-link";
import {
  generateJobResultSchema,
  scanJobResultSchema,
  studioStateSchema,
  type StudioState,
} from "@/lib/contracts";
import type {
  BrandProfile,
  ChannelOutput,
  CreativeComposition,
  GenerationResult,
  ScanResult,
} from "@/lib/contracts";
import { DEMO_COMPOSITION } from "@/lib/demo-data";
import { BrandDnaPanel } from "@/components/studio/brand-dna-panel";
import {
  CampaignBuilder,
  type CampaignDraft,
} from "@/components/studio/campaign-builder";
import { CampaignResults } from "@/components/studio/campaign-results";
import { CampaignVisual, type CampaignDesignRef } from "@/components/studio/campaign-visual";
import { DesignStudio } from "@/components/design-studio/design-studio";
import {
  GenerationProgressScreen,
  type GenerationScreenStage,
} from "@/components/studio/generation-progress-screen";
import { ScanPanel } from "@/components/studio/scan-panel";
import type { ScanStage } from "@/components/studio/scan-live-view";
import { StudioContextBar } from "@/components/studio/studio-context-bar";
import {
  StepNav,
  type StudioStep,
} from "@/components/studio/step-nav";
import { StudioHeader } from "@/components/studio/studio-header";
import { toExportableImageUrl } from "@/lib/studio-export";
import { campaignDesignBrief, campaignDesignDocument } from "@/lib/design-studio/campaign-seed";
import type { DesignAsset } from "@/lib/design-studio/document";
import { getLaunchKitReadiness } from "@/lib/launch-kit";
import { parseDurableJobResult } from "@/lib/job-results";
import {
  CAMPAIGN_JOB_MAX_POLL_DURATION_MS,
  SCAN_JOB_POLLING,
  isRetryableJobPollingError,
  jobError,
  waitForCompletedJob,
  type DurableJob,
} from "@/lib/studio/job-polling";
import { OUTFIT_FONT_FAMILY } from "@/lib/typography";
import { normalizePublicWebsiteUrl } from "@/lib/url-input";
import { campaignDraftWithDefaults } from "@/lib/studio/campaign-defaults";

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

function scanStageForJob(job: DurableJob): ScanStage {
  if (job.status === "queued") return "queued";
  return job.status === "analyzing" || job.status === "completed" ? "analyzing" : "reading";
}
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

// Copies a saved project image into the design studio's sanitized asset store.
async function importDesignAsset(source: string, description: string): Promise<DesignAsset> {
  const image = await fetch(source, { cache: "no-store" });
  if (!image.ok) throw new Error("The project image could not be loaded.");
  const blob = await image.blob();
  const form = new FormData();
  form.set("file", new File([blob], "website-screenshot", { type: blob.type }));
  form.set("kind", "image");
  form.set("description", description);
  const response = await fetch("/api/design-studio/assets", { method: "POST", body: form });
  const data = await response.json() as { asset?: DesignAsset; error?: string };
  if (!response.ok || !data.asset) throw new Error(data.error || "The project image could not be added to your visual.");
  return data.asset;
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

type StudioSaveStatus = "idle" | "saving" | "saved" | "local" | "error";
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
  const entitlementRequest = useRef(0);
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
  const [design, setDesign] = useState<CampaignDesignRef | null>(null);
  const [designStatus, setDesignStatus] = useState<"idle" | "creating" | "error">("idle");
  const [designError, setDesignError] = useState("");
  const [editingVisual, setEditingVisual] = useState(false);
  const designSeeding = useRef<string | null>(null);
  const [composition, setComposition] =
    useState<CreativeComposition>(blankComposition);
  const [scanStatus, setScanStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [scanError, setScanError] = useState("");
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanStage, setScanStage] = useState<ScanStage>("queued");
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [generateError, setGenerateError] = useState("");
  const [generationScreenStage, setGenerationScreenStage] =
    useState<GenerationScreenStage>("preparing");
  const [exportStatus, setExportStatus] = useState<"idle" | "loading">("idle");
  const [exportError, setExportError] = useState("");
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const exportStartedAt = useRef<number | null>(null);
  const exportOperation = useRef<{ signature: string; id: string } | null>(null);
  const [saveStatus, setSaveStatus] = useState<StudioSaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [plan, setPlan] = useState<StudioPlan>("free");
  const [canExportLaunchKit, setCanExportLaunchKit] = useState(false);
  const [storageScope, setStorageScope] = useState("easeyourstartup");
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
      design,
    });
  }, [brand, campaignId, composition, design, draft, generation, jobId, jobType, outputs, projectId, scan, selectedCreativeId, step]);
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
            setStorageScope(data.storageKey);
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
        setDesign(null);
        setEditingVisual(false);
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
        setComposition(savedState.composition);
        setDesign(savedState.design);
        setEditingVisual(false);
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
        setDesign(null);
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
        : jobType === "scan" ? (job) => setScanStage(scanStageForJob(job)) : undefined,
      jobType === "generate" || jobType === "regenerate"
        ? CAMPAIGN_JOB_MAX_POLL_DURATION_MS
        : undefined,
      jobType === "scan" ? SCAN_JOB_POLLING : undefined,
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
          setGeneration(generation);
          setOutputs(generation.outputs);
          setSelectedCreativeId(generation.creativeDirections[0]?.id ?? "");
          setDesign(null);
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
        };
        if (cancelled || requestId !== entitlementRequest.current) return;
        if (data.plan === "free" || data.plan === "pro_lite" || data.plan === "pro") {
          setPlan(data.plan);
          setCanExportLaunchKit(data.canExportLaunchKit === true);
        }

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
  }, [brand, campaignId, composition, design, draft, generation, hydrated, jobId, jobType, outputs, persistStudioState, projectId, scan, selectedCreativeId, startFresh, step]);

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
    setDesign(null);
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
        } else {
          setComposition((current) => current.screenshotUrl !== scanImage ? current : ({
            ...current,
            screenshotUrl: EMPTY_CANVAS_IMAGE,
            mockups: { desktop: EMPTY_CANVAS_IMAGE, tablet: EMPTY_CANVAS_IMAGE, phone: EMPTY_CANVAS_IMAGE },
          }));
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
  useEffect(() => { applyScanResultRef.current = applyScanResult; }, [applyScanResult]);

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
    setScanStage("queued");
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
          setScanPreviewUrl(`/api/capture/scan-preview?target=${encodeURIComponent(normalized)}&projectId=${encodeURIComponent(queued.projectId)}`);
          window.history.replaceState(null, "", `/studio?projectId=${encodeURIComponent(queued.projectId)}`);
          const recoveryState = studioStateSchema.parse({
            ...buildStudioState(),
            projectId: queued.projectId,
            jobId: activeJobId,
            jobType: "scan",
            step: "scan",
          });
          await persistStudioState({ state: recoveryState });
          const result = await waitForCompletedJob(
            queued.job.id,
            (job) => setScanStage(scanStageForJob(job)),
            undefined,
            SCAN_JOB_POLLING,
          );
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
      setGenerationScreenStage("visuals");
      setSelectedCreativeId(data.creativeDirections[0]?.id ?? "");
      setDesign(null);
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

  async function createCampaignDesign(targetCampaignId: string) {
    if (!brand || !generation) return;
    setDesignStatus("creating");
    setDesignError("");
    try {
      const assets: DesignAsset[] = [];
      if (storedAssetId(composition.screenshotUrl)) {
        try {
          assets.push(await importDesignAsset(composition.screenshotUrl, "Website screenshot from the scan"));
        } catch {
          // A text-only layout is still a complete visual.
        }
      }
      const document = campaignDesignDocument({ brand, direction: generation.creativeDirections[0], cta: draft.cta, assets });
      const response = await fetch("/api/design-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", document, fit: true }),
      });
      const data = await response.json() as { design?: { id: string; revision: number }; error?: string };
      if (!response.ok || !data.design) throw new Error(data.error || "Your visual could not be created.");
      if (buildStudioStateRef.current().campaignId !== targetCampaignId) return;
      setDesign({ id: data.design.id, revision: data.design.revision });
      setDesignStatus("idle");
    } catch (error) {
      designSeeding.current = null;
      setDesignStatus("error");
      setDesignError(error instanceof Error ? error.message : "Your visual could not be created.");
    }
  }

  // Every campaign gets a saved design on its first visit to the posts step,
  // including campaigns saved before visuals moved to the design studio.
  useEffect(() => {
    if (!hydrated || step !== "creative" || !generation || !brand || !campaignId || design) return;
    if (designSeeding.current === campaignId) return;
    designSeeding.current = campaignId;
    void createCampaignDesign(campaignId);
  });

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
  const launchKitReadiness = brand
    ? (() => {
        const readiness = getLaunchKitReadiness({ brand, draft, outputs, scan });
        const warnings = design ? readiness.warnings : ["Your visual is still being prepared.", ...readiness.warnings];
        return { ...readiness, ready: readiness.ready && Boolean(design), warnings: [...new Set(warnings)] };
      })()
    : {
        ready: false,
        approvedClaimCount: 0,
        outputCount: 0,
        warnings: ["Scan a product before creating a launch kit."],
      };

  let savedScanPreviewUrl = scan?.desktopCaptureUrl ?? null;
  if (savedScanPreviewUrl?.startsWith("/api/capture?") && projectId) {
    const captureQuery = new URLSearchParams(savedScanPreviewUrl.slice("/api/capture?".length));
    captureQuery.set("projectId", projectId);
    captureQuery.set("preview", "1");
    savedScanPreviewUrl = `/api/capture?${captureQuery}`;
  }

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
          : step === "scan"
            ? "flex min-h-[100dvh] flex-col bg-canvas"
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
            : step === "scan" ? "flex flex-1 flex-col" : undefined
        }
      >
        {step === "scan" && (
          <ScanPanel
            status={jobType === "scan" && jobId && scanStatus === "idle" ? "loading" : scanStatus}
            error={scanError}
            result={scan}
            previewUrl={savedScanPreviewUrl}
            livePreviewUrl={scanPreviewUrl}
            stage={scanStage}
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
        {step === "creative" && generation && brand && (editingVisual && design && campaignId ? (
          <DesignStudio
            key={design.id}
            storageKey={`${storageScope}:design:${campaignId}`}
            campaign={{
              designId: design.id,
              projectName: brand.projectName,
              briefPrompt: campaignDesignBrief({ brand, goal: draft.goal, updateDetails: draft.updateDetails, audience: draft.audience, cta: draft.cta }),
              onSaved: setDesign,
              onBack: () => setEditingVisual(false),
            }}
          />
        ) : (
          <CampaignResults
            outputs={outputs}
            claims={brand.claims.filter((claim) => claim.approvalState !== "rejected")}
            onOutputsChange={setOutputs}
            onRegenerateChannel={regenerateChannel}
            regenerationRemaining={regenerationRemaining}
            regenerationBusyChannel={regenerationBusyChannel}
            plan={plan}
            canExportLaunchKit={canExportLaunchKit}
            saveStatus={saveStatus}
            saveError={saveError}
            onSave={async () => { await persistStudioState({ manual: true }); }}
            visualReady={launchKitReadiness.ready}
            visual={
              <CampaignVisual
                design={design}
                status={designStatus}
                error={designError}
                watermarked={plan !== "pro"}
                onEdit={() => setEditingVisual(true)}
                onRetry={() => { if (campaignId) { designSeeding.current = campaignId; void createCampaignDesign(campaignId); } }}
              />
            }
            exportStatus={jobType === "export" && jobId && !exportDownloadUrl && !exportError ? "loading" : exportStatus}
            exportError={exportError}
            exportDownloadUrl={exportDownloadUrl}
            onExportPng={exportPng}
            onExportZip={exportZip}
          />
        ))}
      </main>
    </div>
  );
}
