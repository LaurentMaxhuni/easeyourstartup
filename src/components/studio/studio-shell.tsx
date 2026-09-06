"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  creativeCodeBundleSchema,
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
import { DEMO_ANGLES, DEMO_COMPOSITION } from "@/lib/demo-data";
import { BrandDnaPanel } from "@/components/studio/brand-dna-panel";
import {
  CampaignBuilder,
  type CampaignDraft,
} from "@/components/studio/campaign-builder";
import { CreativeWorkspace } from "@/components/studio/creative-workspace";
import { ScanPanel } from "@/components/studio/scan-panel";
import { StudioContextBar } from "@/components/studio/studio-context-bar";
import {
  StepNav,
  type StudioStep,
} from "@/components/studio/step-nav";
import { StudioHeader } from "@/components/studio/studio-header";
import { toExportableImageUrl } from "@/lib/studio-export";
import { applyCreativeDesign } from "@/lib/studio/editor-state";
import { buildLaunchKitFiles, getLaunchKitReadiness } from "@/lib/launch-kit";
import { parseDurableJobResult } from "@/lib/job-results";

const EMPTY_DRAFT: CampaignDraft = {
  kind: "feature_update",
  goal: "Get more founders to try the new launch workflow",
  updateDetails:
    "We are launching a source-backed campaign builder that uses approved website claims and real product screenshots.",
  audience: "Solo SaaS founders",
  launchDate: "",
  cta: "Try the free launch scan",
  angle: DEMO_ANGLES[0],
  channels: ["x", "linkedin", "product_hunt"],
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    ).toString();
  } catch {
    return "";
  }
}

type StudioSaveStatus = "idle" | "saving" | "saved" | "local" | "error";
type AutoDesignStatus = "idle" | "loading" | "ai" | "error";
type StudioPlan = "free" | "pro";
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
};
type DurableJob = {
  id: string;
  status: "queued" | "scanning" | "analyzing" | "generating" | "rendering" | "completed" | "failed";
  progress: number;
  result?: unknown;
  error_message?: string | null;
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
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

function jobError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : fallback;
}

async function waitForCompletedJob(jobId: string) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1_000));
    }
    const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    const data = (await response.json()) as { job?: DurableJob; error?: string };
    if (!response.ok) throw new Error(jobError(data, "Job status could not be loaded."));
    const job = data.job;
    if (!job) throw new Error("Job status did not include a job record.");
    if (job.status === "completed") return job.result;
    if (job.status === "failed") {
      throw new Error(job.error_message || "The background job failed. Try again.");
    }
  }
  throw new Error("The job is taking longer than expected. Your progress is saved; try reopening the studio shortly.");
}

function applyCreativeDirection(
  composition: CreativeComposition,
  direction: CreativeDirection,
): CreativeComposition {
  return {
    ...composition,
    templateId: direction.layout,
    icon: direction.icon,
    graphic: direction.graphic,
    imageMode: direction.imageMode,
    elements: undefined,
    codeBundle: undefined,
    codeSource: undefined,
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

export function StudioShell() {
  const searchParams = useSearchParams();
  const startFresh = searchParams.get("new") === "1";
  const autoStarted = useRef(false);
  const hydrating = useRef(true);
  const storageKey = useRef<string | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const autoDesignRequest = useRef(0);
  const entitlementRequest = useRef(0);
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<StudioStep>("scan");
  const [projectId, setProjectId] = useState<string | null>(null);
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
    useState<CreativeComposition>(DEMO_COMPOSITION);
  const [scanStatus, setScanStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [scanError, setScanError] = useState("");
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [generateError, setGenerateError] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const [exportStatus, setExportStatus] = useState<"idle" | "loading">("idle");
  const [exportError, setExportError] = useState("");
  const [saveStatus, setSaveStatus] = useState<StudioSaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [plan, setPlan] = useState<StudioPlan>("free");
  const [canExportLaunchKit, setCanExportLaunchKit] = useState(false);
  const [campaignsRemaining, setCampaignsRemaining] = useState<number | null>(
    null,
  );
  const [entitlementRefreshVersion, setEntitlementRefreshVersion] =
    useState(0);

  const buildStudioState = useCallback((): StudioState => {
    return studioStateSchema.parse({
      step,
      projectId,
      scan,
      brand,
      draft,
      generation,
      selectedCreativeId,
      outputs,
      composition,
    });
  }, [brand, composition, draft, generation, outputs, projectId, scan, selectedCreativeId, step]);

  const persistStudioState = useCallback(
    async (options: { manual?: boolean } = {}) => {
      let state: StudioState;
      try {
        state = buildStudioState();
      } catch {
        setSaveStatus("error");
        setSaveError("This editor state could not be validated for saving.");
        return;
      }

      if (storageKey.current) {
        try {
          window.localStorage.setItem(storageKey.current, JSON.stringify(state));
        } catch {
          // The database save below is still useful when browser storage is blocked.
        }
      }

      saveRequest.current?.abort();
      const controller = new AbortController();
      saveRequest.current = controller;
      if (options.manual) {
        setSaveStatus("saving");
        setSaveError("");
      }

      try {
        const response = await fetch("/api/studio/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Database persistence is unavailable.");
        }
        setSaveStatus("saved");
        setSaveError("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (storageKey.current) {
          setSaveStatus("local");
          setSaveError("Saved on this device. Account sync is unavailable.");
        } else {
          setSaveStatus("error");
          setSaveError("The account save service could not be reached.");
        }
      } finally {
        if (saveRequest.current === controller) saveRequest.current = null;
      }
    },
    [buildStudioState],
  );

  useEffect(() => {
    let cancelled = false;
    if (startFresh) hydrating.current = true;

    async function hydrateStudioState() {
      let savedState: StudioState | null = null;
      let persistence: "database" | "local" = "local";
      try {
        const response = await fetch("/api/studio/state", {
          cache: "no-store",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            state?: unknown;
            storageKey?: string;
            persistence?: "database" | "local";
          };
          persistence = data.persistence === "database" ? "database" : "local";
          if (typeof data.storageKey === "string" && data.storageKey.length <= 120) {
            storageKey.current = data.storageKey;
          }
          savedState = studioStateSchema.safeParse(data.state).success
            ? studioStateSchema.parse(data.state)
            : null;
        }
      } catch {
        // A local snapshot can still restore the editor when the API is unavailable.
      }

      if (!startFresh && !savedState && storageKey.current) {
        try {
          savedState = parseStoredStudioState(
            window.localStorage.getItem(storageKey.current),
          );
        } catch {
          savedState = null;
        }
      }

      if (!cancelled && startFresh) {
        setStep("scan");
        setProjectId(null);
        setScan(null);
        setBrand(null);
        setDraft(EMPTY_DRAFT);
        setGeneration(null);
        setSelectedCreativeId("");
        setOutputs([]);
        setAutoDesignStatus("idle");
        setAutoDesignWarning("");
        setComposition(DEMO_COMPOSITION);
        setScanStatus("idle");
        setScanError("");
        setGenerateStatus("idle");
        setGenerateError("");
        setSaveStatus("idle");
        setSaveError("");
      } else if (!cancelled && savedState) {
        setStep(savedState.step);
        setProjectId(savedState.projectId);
        setScan(savedState.scan);
        setBrand(savedState.brand);
        setDraft(savedState.draft);
        setGeneration(savedState.generation);
        setSelectedCreativeId(savedState.selectedCreativeId);
        setOutputs(savedState.outputs);
        setAutoDesignStatus("idle");
        setAutoDesignWarning("");
        setComposition(savedState.composition);
        setSaveStatus(persistence === "database" ? "saved" : "local");
        setSaveError("");
      }

      if (!cancelled) {
        hydrating.current = false;
        setHydrated(true);
      }
    }

    void hydrateStudioState();
    return () => {
      cancelled = true;
    };
  }, [startFresh]);

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
        };
        if (cancelled || requestId !== entitlementRequest.current) return;
        if (data.plan === "free" || data.plan === "pro") {
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
    if (!hydrated || hydrating.current) return;
    if (startFresh && !scan && !brand && !generation) return;
    const timer = window.setTimeout(() => {
      void persistStudioState();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [brand, generation, hydrated, persistStudioState, scan, startFresh]);

  const applyScanResult = useCallback((data: ScanResult, nextProjectId: string | null) => {
    setProjectId(nextProjectId);
    setScan(data);
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
      data.desktopCaptureUrl ?? data.profile.imageUrl ?? data.profile.logoUrl,
      "/images/founder-launch-studio.png",
    );
    setComposition((current) => ({
      ...current,
      elements: undefined,
      codeBundle: undefined,
      codeSource: undefined,
      screenshotUrl: scanImage,
      mockups: {
        desktop: scanImage,
        tablet: scanImage,
        phone: scanImage,
      },
      tokens: {
        ...current.tokens,
        background: data.profile.colors[0] ?? current.tokens.background,
      },
      text: {
        ...current.text,
        eyebrow: data.profile.projectName,
        headline: data.profile.tagline || current.text.headline,
        cta: data.profile.cta || current.text.cta,
      },
    }));
    setScanStatus("success");
    setStep("brand");
    if (startFresh) {
      window.history.replaceState(null, "", "/studio");
    }
  }, [startFresh]);

  const runScan = useCallback(async (url?: string, demo = false) => {
    const normalized = demo ? undefined : normalizeUrl(url ?? "");
    if (!demo && !normalized) {
      setScanStatus("error");
      setScanError("Enter a valid public HTTP or HTTPS website.");
      return;
    }

    setScanStatus("loading");
    setScanError("");
    const startedAt = Date.now();
    trackStudioEvent("scan_started", { mode: demo ? "demo" : "durable" });
    try {
      let data: ScanResult;
      let resolvedProjectId: string | null = null;
      let mode: "durable" | "direct" | "demo" = demo ? "demo" : "durable";
      if (!demo && normalized) {
        const response = await fetch("/api/jobs/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          const result = await waitForCompletedJob(queued.job.id);
          data = parseDurableJobResult(result, scanJobResultSchema).scan;
          resolvedProjectId = queued.projectId;
        } else if (
          response.status === 503 &&
          queued.error === "Durable jobs are not configured."
        ) {
          const directResponse = await fetch("/api/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: normalized }),
          });
          const direct = (await directResponse.json()) as ScanResult & { error?: string };
          if (!directResponse.ok) throw new Error(direct.error || "Scan failed.");
          data = direct;
          mode = "direct";
        } else {
          throw new Error(jobError(queued, "Scan failed."));
        }
      } else {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demo: true }),
        });
        const direct = (await response.json()) as ScanResult & { error?: string };
        if (!response.ok) throw new Error(direct.error || "Scan failed.");
        data = direct;
      }
      applyScanResult(data, resolvedProjectId);
      trackStudioEvent("scan_completed", {
        mode,
        sourcePageCount: data.pages.length,
        approvedClaimCount: data.profile.claims.filter(
          (claim) => claim.approvalState === "approved",
        ).length,
        warningCount: data.warnings.length,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setScanStatus("error");
      setScanError(error instanceof Error ? error.message : "Scan failed.");
      trackStudioEvent("scan_failed", {
        mode: demo ? "demo" : projectId ? "durable" : "direct",
        durationMs: Date.now() - startedAt,
      });
    }
  }, [applyScanResult, projectId]);

  useEffect(() => {
    if (!hydrated || autoStarted.current) return;
    const demo = searchParams.get("demo") === "1";
    const url = searchParams.get("url");
    if (demo || url) {
      autoStarted.current = true;
      const timer = window.setTimeout(
        () => void runScan(url ?? undefined, demo),
        0,
      );
      return () => window.clearTimeout(timer);
    }
  }, [hydrated, runScan, searchParams]);

  async function runAutomaticDesign(
    baseComposition: CreativeComposition,
    profile: BrandProfile,
    campaignDraft: CampaignDraft,
  ) {
    const requestId = ++autoDesignRequest.current;
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
        instruction:
          "Design the full launch canvas for this campaign and generate the editable HTML, CSS, and JavaScript preview now. Make the composition feel distinct from the starting template while keeping the approved product facts and screenshot assets.",
        composition: baseComposition,
      },
      requestId,
    );
    if (requestId !== autoDesignRequest.current) return;
    setComposition((current) => ({
      ...applyCreativeDesign(current, result.design),
      codeBundle: result.code,
      codeSource: "ai",
    }));
  }

  async function runGeneration() {
    if (!brand) return;
    if (draft.goal.trim().length < 8 || draft.updateDetails.trim().length < 8) {
      setGenerateStatus("error");
      setGenerateError("Add a clear goal and update description.");
      return;
    }
    if (draft.channels.length === 0) {
      setGenerateStatus("error");
      setGenerateError("Select at least one channel.");
      return;
    }

    setGenerateStatus("loading");
    setGenerateError("");
    autoDesignRequest.current += 1;
    setAutoDesignStatus("idle");
    setAutoDesignWarning("");
    const startedAt = Date.now();
    trackStudioEvent("generation_started", {
      channelCount: draft.channels.length,
      approvedClaimCount: brand.claims.filter(
        (claim) => claim.approvalState === "approved",
      ).length,
      mode: projectId ? "durable" : "direct",
    });
    try {
      const campaign = {
        brand,
        kind: draft.kind,
        goal: draft.goal,
        updateDetails: draft.updateDetails,
        audience: draft.audience,
        launchDate: draft.launchDate,
        cta: draft.cta,
        angle: draft.angle,
        channels: draft.channels,
      };
      let data: GenerationResult;
      let mode: "durable" | "direct" = projectId ? "durable" : "direct";
      if (projectId) {
        const response = await fetch("/api/jobs/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, campaign }),
        });
        const queued = (await response.json()) as {
          job?: DurableJob;
          error?: string;
        };
        if (response.ok) {
          if (!queued.job?.id) {
            throw new Error("The campaign job did not return an id.");
          }
          const result = await waitForCompletedJob(queued.job.id);
          data = parseDurableJobResult(result, generateJobResultSchema).generation;
        } else if (
          response.status === 503 &&
          queued.error === "Durable jobs are not configured."
        ) {
          const directResponse = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(campaign),
          });
          const direct = (await directResponse.json()) as GenerationResult & { error?: string };
          if (!directResponse.ok) {
            throw new Error(direct.error || "Campaign generation failed.");
          }
          data = direct;
          mode = "direct";
        } else {
          throw new Error(jobError(queued, "Campaign generation failed."));
        }
      } else {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campaign),
        });
        const direct = (await response.json()) as GenerationResult & { error?: string };
        if (!response.ok) {
          throw new Error(direct.error || "Campaign generation failed.");
        }
        data = direct;
      }
      setGeneration(data);
      setOutputs(data.outputs);
      if (mode === "durable") {
        setEntitlementRefreshVersion((version) => version + 1);
      }
      const firstDirection = data.creativeDirections[0];
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
      setComposition(nextComposition);
      // Do not enter the editor until the provider has returned the complete
      // AI-authored canvas and code bundle. A failed design must never expose
      // the starting template as if it were generated output.
      await runAutomaticDesign(nextComposition, brand, draft);
      setGenerateStatus("idle");
      setStep("creative");
      trackStudioEvent("generation_completed", {
        mode,
        channelCount: data.outputs.length,
        approvedClaimCount: brand.claims.filter(
          (claim) => claim.approvalState === "approved",
        ).length,
        warningCount: data.outputs.reduce(
          (count, output) => count + output.warnings.length,
          0,
        ),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
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

  function selectCreativeDirection(id: string) {
    const direction = generation?.creativeDirections.find(
      (candidate) => candidate.id === id,
    );
    if (!direction) return;
    autoDesignRequest.current += 1;
    setAutoDesignStatus("idle");
    setAutoDesignWarning("");
    setSelectedCreativeId(id);
    const nextComposition = applyCreativeDirection(composition, direction);
    if (brand) {
      void runAutomaticDesign(nextComposition, brand, draft).catch(() => {
        // The AI request records the visible error state; no local scene is
        // applied when a direction cannot be designed by the provider.
      });
    }
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
    const response = await fetch("/api/ai/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
  ) {
    autoDesignRequest.current = Math.max(autoDesignRequest.current, requestId);
    if (requestId === autoDesignRequest.current) {
      setAutoDesignStatus("loading");
      setAutoDesignWarning("");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 75_000);
    try {
      const response = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const body = await response.text();
      let data: {
        design?: unknown;
        code?: unknown;
        mode?: "ai";
        provider?: "groq" | "openrouter" | "openai" | "compatible";
        error?: string;
      };
      try {
        data = JSON.parse(body) as typeof data;
      } catch {
        throw new Error(
          `AI design returned an invalid server response (${response.status}).`,
        );
      }
      if (!response.ok || !data.design || !data.code || data.mode !== "ai") {
        throw new Error(data.error || `AI design failed (${response.status}).`);
      }
      if (requestId === autoDesignRequest.current) {
        setAutoDesignStatus("ai");
        setAutoDesignWarning("");
      }
      return {
        design: creativeDesignResultSchema.parse(data.design),
        code: creativeCodeBundleSchema.parse(data.code),
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

  async function renderPreview() {
    if (!captureRef.current) throw new Error("Creative preview is unavailable.");
    const { toPng } = await import("html-to-image");
    return toPng(captureRef.current, {
      width: composition.output.width,
      height: composition.output.height,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: composition.tokens.background,
      style: {
        width: `${composition.output.width}px`,
        height: `${composition.output.height}px`,
      },
    });
  }

  async function exportPng() {
    if (!canExportLaunchKit) {
      setExportError("Upgrade to Pro to download an unwatermarked launch visual.");
      return;
    }
    setExportStatus("loading");
    setExportError("");
    const startedAt = Date.now();
    trackStudioEvent("export_started", { outputCount: outputs.length });
    try {
      const dataUrl = await renderPreview();
      downloadDataUrl(dataUrl, "easeyourstartup-campaign-preview.png");
      trackStudioEvent("export_completed", {
        outputCount: outputs.length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      setExportError(
        "The preview could not be exported. Try an uploaded screenshot.",
      );
      trackStudioEvent("export_failed", {
        outputCount: outputs.length,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setExportStatus("idle");
    }
  }

  async function exportZip() {
    if (!canExportLaunchKit) {
      setExportError("Upgrade to Pro to download the full launch kit.");
      return;
    }
    if (!brand) {
      setExportError("A source-backed brand profile is required before exporting.");
      return;
    }
    setExportStatus("loading");
    setExportError("");
    const startedAt = Date.now();
    trackStudioEvent("export_started", {
      outputCount: outputs.length,
      approvedClaimCount: brand.claims.filter(
        (claim) => claim.approvalState === "approved",
      ).length,
    });
    try {
      const [{ default: JSZip }, dataUrl] = await Promise.all([
        import("jszip"),
        renderPreview(),
      ]);
      const zip = new JSZip();
      for (const file of buildLaunchKitFiles({
        brand,
        draft,
        outputs,
        composition,
        scan,
      })) {
        zip.file(file.path, file.contents);
      }
      zip.file("creative-preview.png", dataUrl.split(",")[1], {
        base64: true,
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, "easeyourstartup-launch-kit.zip");
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      trackStudioEvent("export_completed", {
        outputCount: outputs.length,
        approvedClaimCount: brand.claims.filter(
          (claim) => claim.approvalState === "approved",
        ).length,
        durationMs: Date.now() - startedAt,
      });
    } catch {
      setExportError("The campaign ZIP could not be created.");
      trackStudioEvent("export_failed", {
        outputCount: outputs.length,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setExportStatus("idle");
    }
  }

  const available: StudioStep[] = [
    "scan",
    ...(scan ? (["brand", "campaign"] as StudioStep[]) : []),
    ...(generation ? (["creative"] as StudioStep[]) : []),
  ];
  const launchKitReadiness = brand
    ? getLaunchKitReadiness({ brand, draft, outputs, composition, scan })
    : {
        ready: false,
        approvedClaimCount: 0,
        outputCount: 0,
        warnings: ["Scan a product and approve facts before creating a launch kit."],
      };

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
          <StudioHeader />
          <StepNav current={step} available={available} onChange={setStep} />
          {step !== "scan" && scan && brand && (
            <StudioContextBar
              stage={step}
              projectName={brand.projectName}
              sourceUrl={scan.pages[0]?.url ?? ""}
              approvedClaims={
                brand.claims.filter(
                  (claim) => claim.approvalState === "approved",
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
            status={scanStatus}
            error={scanError}
            result={scan}
            onScan={runScan}
          />
        )}
        {step === "brand" && scan && brand && (
          <BrandDnaPanel
            scan={scan}
            brand={brand}
            onChange={setBrand}
            onClaimsApproved={(approvedClaimCount) =>
              trackStudioEvent("claims_approved", { approvedClaimCount })
            }
            onBack={() => setStep("scan")}
            onContinue={() => setStep("campaign")}
          />
        )}
        {step === "campaign" && brand && (
          <CampaignBuilder
            draft={draft}
            angles={generation?.angles ?? DEMO_ANGLES}
            status={generateStatus}
            error={generateError}
            onChange={setDraft}
            onBack={() => setStep("brand")}
            onGenerate={runGeneration}
          />
        )}
        {step === "creative" && generation && brand && (
          <CreativeWorkspace
            composition={composition}
            outputs={outputs}
            generationProvider={generation.provider}
            autoDesignStatus={autoDesignStatus}
            autoDesignWarning={autoDesignWarning}
            captureRef={captureRef}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
            exportStatus={exportStatus}
            exportError={exportError}
            plan={plan}
            canExportLaunchKit={canExportLaunchKit}
            campaignsRemaining={campaignsRemaining}
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
            onSave={() => persistStudioState({ manual: true })}
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
                .filter((claim) => claim.approvalState === "approved")
                .map((claim) => claim.text),
              approvedClaims: brand.claims.filter(
                (claim) => claim.approvalState === "approved",
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
