"use client";

import Link from "next/link";
import { ArrowLeft, ArrowCounterClockwise, ArrowClockwise, ArrowUp, ArrowsOut, Copy, DownloadSimple, Eye, EyeSlash, FloppyDisk, Hand, ClockCounterClockwise, LockKey, LockKeyOpen, Minus, MouseSimple, Plus, Sparkle, Square, Stack, TextT, Trash, UploadSimple, X, Gear, WarningCircle } from "@phosphor-icons/react";
import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { CANVAS_PRESETS, DESIGN_FONTS, designDocumentSchema, designNodeSchema, emptyDesignDocument, type BrandKit, type DesignAsset, type DesignDocument, type DesignNode } from "@/lib/design-studio/document";
import { DesignCanvas } from "./design-canvas";
import { commitHistory, createHistory, redoHistory, undoHistory } from "./history";
import styles from "./design-studio.module.css";

type SavedDesign = { id: string; title: string; revision: number; updatedAt: string; document: DesignDocument };
type SavedBrand = { id: string; name: string; kit: BrandKit; assets: DesignAsset[] };
type Version = { id: string; revision: number; createdAt: string; document: DesignDocument };
type ReviewIssue = { pageId: string; nodeId?: string; severity: "error" | "warning"; message: string };
type FeedbackRound = { round: number; deterministic: (ReviewIssue & { code: string })[]; vision: { score: number; issues: (ReviewIssue & { category: string; suggestion: string })[] } | null; visionStatus: "available" | "unavailable" | "failed"; warning?: string };
type Variant = { id: string; name: string; document: DesignDocument; feedback: FeedbackRound[]; visionAvailable: boolean };
type Provider = { id: string; name?: string; model?: string; configured?: boolean; available?: boolean; status?: string; models?: { id: string; tasks: string[]; vision: boolean; structuredOutput: boolean; streaming: boolean }[]; telemetry?: { requests: number; failures: number; inputTokens: number; outputTokens: number }; [key: string]: unknown };
type Job = { id: string; status: string; stage: string; error?: string; result?: { variants: Variant[]; usage: unknown[]; warnings?: string[] }; preview?: { dataUrl: string; pageId: string } };
type Message = { role: "user" | "assistant"; text: string };
const uid = () => crypto.randomUUID();
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please retry.";
function reviewNeedsAttention(variant?: Variant) {
  const latest = variant?.feedback.at(-1);
  return !!latest && (latest.deterministic.some((issue) => issue.severity === "error") ||
    (latest.visionStatus === "available" && !!latest.vision && (latest.vision.score < 65 || latest.vision.issues.some((issue) => issue.severity === "error"))));
}
function reviewSummary(variant: Variant, running: boolean) {
  const latest = variant.feedback.at(-1);
  if (!latest) return running ? "Review in progress" : "Review not returned";
  if (reviewNeedsAttention(variant)) return "Review issues before export";
  if (latest.visionStatus === "failed") return "Layout review · vision failed";
  return latest.visionStatus === "available" ? "Visual + layout review" : "Layout review · vision unavailable";
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? "A newer saved revision exists. Your local work is safe. Save a copy or open the latest version." : typeof data.error === "string" ? data.error : data.error?.message || "The request failed. Please retry.");
  return data as T;
}
async function api<T>(body: unknown): Promise<T> {
  return readResponse<T>(await fetch("/api/design-studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function Tool({ label, children, onClick, disabled, active }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={`${styles.tool} ${active ? styles.activeTool : ""}`} title={label} aria-label={label} disabled={disabled} aria-pressed={active} onClick={onClick}>{children}</button>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, { "aria-label": label }) : children}</label>;
}

export function DesignStudio({ storageKey }: { storageKey: string }) {
  const [history, setHistory] = useState(() => createHistory(emptyDesignDocument()));
  const doc = history.present;
  const current = useRef(doc);
  current.current = doc;
  const [pageId, setPageId] = useState(doc.pages[0].id);
  const page = doc.pages.find((item) => item.id === pageId) ?? doc.pages[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = page.nodes.find((node) => node.id === selectedId);
  const [leftTab, setLeftTab] = useState("brief");
  const [rightTab, setRightTab] = useState("properties");
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [formats, setFormats] = useState("portrait");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1350);
  const [variantCount, setVariantCount] = useState(1);
  const [slideCount, setSlideCount] = useState(1);
  const [revisionLimit, setRevisionLimit] = useState(3);
  const [tokenBudget, setTokenBudget] = useState(60000);
  const [provider, setProvider] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerSettings, setProviderSettings] = useState<{ enabled?: boolean; configurationError?: boolean; telemetryScope?: string }>({});
  const [usage, setUsage] = useState<unknown[]>([]);
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [brands, setBrands] = useState<SavedBrand[]>([]);
  const [brandId, setBrandId] = useState<string>();
  const [savedId, setSavedId] = useState<string>();
  const savedIdRef = useRef(savedId);
  savedIdRef.current = savedId;
  const [revision, setRevision] = useState<number>();
  const [versions, setVersions] = useState<Version[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariantRef = useRef(selectedVariantId);
  selectedVariantRef.current = selectedVariantId;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(.35);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hand, setHand] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const [exportScale, setExportScale] = useState(1);
  const [exportEntitlements, setExportEntitlements] = useState({ highResolutionExports: false, watermarked: true });
  const [assetKind, setAssetKind] = useState("image");
  const [assetDescription, setAssetDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const canvasHost = useRef<HTMLDivElement>(null);
  const generationSnapshot = useRef("");
  const autoAppliedJob = useRef("");
  const autoAppliedDocument = useRef("");
  const loadSequence = useRef(0);
  const busyJob = !!job && ["queued", "running"].includes(job.status);
  const reviewVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const latestReview = reviewVariant?.feedback.at(-1);
  const reviewMatchesDocument = !!reviewVariant && JSON.stringify(reviewVariant.document) === JSON.stringify(doc);
  const reviewAttention = reviewNeedsAttention(reviewVariant);
  const reviewWarnings = [...new Set([...(job?.result?.warnings ?? []), ...(reviewVariant?.feedback.flatMap((round) => round.warning ? [round.warning] : []) ?? [])])];
  const change = useCallback((update: DesignDocument | ((doc: DesignDocument) => DesignDocument)) => {
    setHistory((state) => {
      const next = typeof update === "function" ? update(state.present) : update;
      const parsed = designDocumentSchema.safeParse(next);
      return parsed.success ? commitHistory(state, parsed.data) : state;
    });
  }, []);
  function undo() { setHistory(undoHistory); setBrandId(undefined); }
  function redo() { setHistory(redoHistory); setBrandId(undefined); }
  function removeAsset(assetId: string) {
    change((document) => ({ ...document, assets: document.assets.filter((asset) => asset.id !== assetId),
      pages: document.pages.map((item) => {
        const nodes = item.nodes.filter((node) => node.assetId !== assetId);
        return { ...item, nodes: nodes.length ? nodes : [designNodeSchema.parse({ id: uid(), type: "text", name: "New text", role: "body", x: 80, y: 80, width: item.width - 160, height: 100, text: "" })] };
      }),
    }));
    setSelectedId(null);
  }
  function updatePage(changes: Partial<typeof page>) {
    change((document) => ({ ...document, pages: document.pages.map((item) => item.id === page.id ? { ...item, ...changes } : item) }));
  }
  function updateNode(id: string, changes: Partial<DesignNode>, allowLocked = false) {
    change((document) => ({ ...document, pages: document.pages.map((item) => item.id === page.id ? { ...item, nodes: item.nodes.map((node) => node.id === id && (!node.locked || allowLocked) ? { ...node, ...changes } : node) } : item) }));
  }
  function updateBrand(changes: Partial<BrandKit>) { change((document) => ({ ...document, brand: { ...document.brand, ...changes } })); }
  function fitCanvas() {
    const rect = canvasHost.current?.getBoundingClientRect();
    if (rect) setZoom(Math.max(.05, Math.min(1, (rect.width - 80) / page.width, (rect.height - 100) / page.height)));
    setPan({ x: 0, y: 0 });
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function initialize() {
      try {
        const local = localStorage.getItem(storageKey);
        if (local) {
          const draft = JSON.parse(local);
          const parsed = designDocumentSchema.safeParse(draft.document);
          if (parsed.success && !cancelled) {
            setHistory(createHistory(parsed.data)); setPageId(parsed.data.pages[0].id);
            setSavedId(draft.id); setRevision(draft.revision);
            savedIdRef.current = draft.id;
            if (typeof draft.brandId === "string") setBrandId(draft.brandId);
            if (draft.jobId) setJob({ id: draft.jobId, status: "running", stage: "Recovering generation" });
            setNotice("Recovered your local draft.");
          }
        }
      } catch { if (!cancelled) setNotice("Local draft recovery is unavailable in this browser."); }
      try {
        const data = await readResponse<{ designs: SavedDesign[]; brands: SavedBrand[]; providers: Provider[]; providerSettings?: typeof providerSettings; usage?: unknown[]; activeJobs?: Job[]; exportEntitlements?: typeof exportEntitlements }>(await fetch("/api/design-studio", { signal: controller.signal }));
        if (!cancelled) {
          setSavedDesigns(data.designs ?? []); setBrands(data.brands ?? []); setProviders(data.providers ?? []); setProviderSettings(data.providerSettings ?? {}); setUsage(data.usage ?? []);
          if (data.exportEntitlements) setExportEntitlements(data.exportEntitlements);
          if (data.activeJobs?.length) setJob((current) => current ?? data.activeJobs![0]);
        }
      } catch (failure) { if (!cancelled) setError(errorText(failure)); }
      if (!cancelled) setReady(true);
    }
    void initialize();
    return () => { cancelled = true; controller.abort(); };
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    const persist = () => {
      try { localStorage.setItem(storageKey, JSON.stringify({ document: doc, id: savedId, revision, brandId, jobId: busyJob ? job?.id : undefined })); }
      catch { setNotice("Browser storage is full. Save your design to keep this revision."); }
    };
    const timeout = setTimeout(persist, 350);
    window.addEventListener("pagehide", persist);
    return () => { clearTimeout(timeout); window.removeEventListener("pagehide", persist); };
  }, [doc, ready, savedId, revision, brandId, storageKey, busyJob, job?.id]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || (event.target instanceof HTMLElement && event.target.matches("input,textarea,select,[contenteditable]"))) return;
      if (event.key.toLowerCase() === "z") { event.preventDefault(); setHistory(event.shiftKey ? redoHistory : undoHistory); setBrandId(undefined); }
      if (event.key.toLowerCase() === "y") { event.preventDefault(); setHistory(redoHistory); setBrandId(undefined); }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  const jobId = job?.id;
  useEffect(() => {
    if (!jobId || !busyJob) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      try {
        const data = await readResponse<{ job: Job }>(await fetch(`/api/design-studio/jobs/${jobId}`, { signal: controller.signal }));
        if (stopped) return;
        setJob(data.job);
        if (data.job.result?.variants.length) {
          setVariants(data.job.result.variants);
          const currentJson = JSON.stringify(current.current);
          const nextJson = JSON.stringify(data.job.result.variants[0].document);
          const mayApply = (autoAppliedJob.current !== jobId && generationSnapshot.current === currentJson) ||
            (autoAppliedJob.current === jobId && autoAppliedDocument.current === currentJson);
          if (mayApply && nextJson !== currentJson) {
            autoAppliedJob.current = jobId!;
            autoAppliedDocument.current = nextJson;
            change(data.job.result.variants[0].document);
            setSelectedVariantId(data.job.result.variants[0].id);
            selectedVariantRef.current = data.job.result.variants[0].id;
            setBrandId(undefined);
            setPageId(data.job.result.variants[0].document.pages[0].id);
            setNotice("First composition is ready. You can edit while the review continues.");
          }
        }
        if (data.job.status === "failed") setError(data.job.error || "Generation failed. Your existing design is safe.");
        if (data.job.status === "completed") {
          const reviewed = data.job.result?.variants.find((variant) => variant.id === selectedVariantRef.current) ?? data.job.result?.variants[0];
          const attention = reviewNeedsAttention(reviewed);
          setMessages((items) => [...items, { role: "assistant", text: attention ? "Your composition is rendered. Review issues before export: the latest checks found errors or a visual score below 65. Open Review for the findings and suggested changes." : "Your composition is rendered. Open Review to inspect the checks, then choose a direction or ask for a refinement." }]);
          if (attention) setNotice("Review issues before export. Open Review for the latest findings and suggestions.");
          else if (autoAppliedJob.current !== jobId) setNotice("New directions are ready below the canvas. Select one to replace your current composition.");
        }
        if (["queued", "running"].includes(data.job.status)) timer = setTimeout(poll, 1600);
      } catch (failure) {
        if (!stopped) { setError(errorText(failure)); timer = setTimeout(poll, 5000); }
      }
    }
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [jobId, busyJob, change]);

  async function save(copy = false) {
    setSaving(true); setError("");
    const snapshot = doc;
    try {
      const data = await api<{ design: SavedDesign }>({ action: "save", ...(copy ? {} : { id: savedId, revision }), document: copy ? { ...snapshot, title: `${snapshot.title.slice(0, 172)} copy` } : snapshot });
      setSavedId(data.design.id); setRevision(data.design.revision);
      savedIdRef.current = data.design.id;
      setSavedDesigns((items) => [data.design, ...items.filter((item) => item.id !== data.design.id)]);
      void refreshVersions(data.design.id);
      if (copy && current.current === snapshot) change(data.design.document);
      setNotice(`Saved revision ${data.design.revision}.`);
    } catch (failure) { setError(errorText(failure)); } finally { setSaving(false); }
  }
  async function refreshVersions(id: string) {
    try {
      const data = await readResponse<{ versions: Version[] }>(await fetch(`/api/design-studio?designId=${encodeURIComponent(id)}`));
      if (savedIdRef.current !== id) return;
      setVersions(data.versions ?? []);
    } catch (failure) { setError(errorText(failure)); }
  }
  async function openDesign(id: string) {
    if (saving) return;
    const request = ++loadSequence.current;
    const snapshot = current.current;
    setError("");
    try {
      const data = await readResponse<{ design: SavedDesign; versions: Version[] }>(await fetch(`/api/design-studio?designId=${encodeURIComponent(id)}`));
      if (request !== loadSequence.current || current.current !== snapshot) { setNotice("Your design changed while loading. Select the saved design again to open it."); return; }
      change(data.design.document); setPageId(data.design.document.pages[0].id); setSelectedId(null);
      setSavedId(data.design.id); setRevision(data.design.revision); setVersions(data.versions ?? []);
      savedIdRef.current = data.design.id; setBrandId(undefined);
      setSelectedVariantId(null); setVariants([]);
      setNotice("Saved design opened. Undo returns to your previous composition.");
    } catch (failure) { setError(errorText(failure)); }
  }
  async function generate(edit = false) {
    const instruction = (edit ? editPrompt : prompt).trim();
    if (!instruction || busyJob || busy) return;
    setBusy(true); setError(""); setVariants([]); setSelectedVariantId(null);
    generationSnapshot.current = JSON.stringify(doc);
    try {
      const data = await api<{ job: Job }>(edit ? { action: "edit", prompt: instruction, document: doc, history: messages.slice(-12).map((message) => `${message.role}: ${message.text}`), preferredProvider: provider || undefined } : { action: "generate", prompt: instruction, brand: doc.brand, assets: doc.assets, width, height, variants: variantCount, slides: slideCount, preferredProvider: provider || undefined, tokenBudget, revisionLimit });
      setJob(data.job);
      setMessages((items) => [...items, { role: "user", text: instruction }]);
      if (edit) setEditPrompt("");
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  }
  async function jobAction(action: "cancel" | "retry") {
    if (!job || busy) return;
    setBusy(true); setError("");
    try {
      if (action === "retry") { generationSnapshot.current = JSON.stringify(doc); autoAppliedJob.current = ""; autoAppliedDocument.current = ""; }
      const data = await api<{ job: Job }>({ action, jobId: job.id }); setJob(data.job);
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  }
  async function saveBrand() {
    setSaving(true); setError("");
    try {
      const data = await api<{ brand: SavedBrand }>({ action: "brand", id: brandId, kit: doc.brand, assets: doc.assets });
      setBrandId(data.brand.id); setBrands((items) => [data.brand, ...items.filter((item) => item.id !== data.brand.id)]); setNotice("Brand profile and design memory saved.");
    } catch (failure) { setError(errorText(failure)); } finally { setSaving(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.set("file", file); body.set("kind", assetKind); body.set("description", assetDescription);
      const data = await readResponse<{ asset: DesignAsset }>(await fetch("/api/design-studio/assets", { method: "POST", body }));
      change((document) => ({ ...document, assets: [...document.assets, data.asset] })); setNotice(`${data.asset.name} added to your assets.`);
    } catch (failure) { setError(errorText(failure)); } finally { setUploading(false); }
  }
  async function exportDesign() {
    setExporting(true); setError("");
    try {
      const response = await fetch("/api/design-studio/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: doc, pageId: page.id, scale: exportScale, format: exportFormat }) });
      if (!response.ok) { await readResponse(response); return; }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `${doc.title.replace(/[^a-zA-Z0-9_-]/g, "-")}.${exportFormat}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000); setNotice("Export downloaded.");
    } catch (failure) { setError(errorText(failure)); } finally { setExporting(false); }
  }
  function addNode(type: "text" | "rect" | "ellipse" | "image", assetId?: string) {
    if (page.nodes.length >= 100) return;
    const node = designNodeSchema.parse({ id: uid(), type, name: type === "text" ? "New text" : type === "image" ? "Image" : "Shape", x: 80, y: 80, width: type === "text" ? 700 : 300, height: type === "text" ? 140 : 300, text: type === "text" ? "Make your mark." : "", fontSize: 72, fill: doc.brand.primary, assetId });
    updatePage({ nodes: [...page.nodes, node] }); setSelectedId(node.id); setRightTab("properties");
  }
  function reorder(id: string, offset: number) {
    const nodes = [...page.nodes]; const index = nodes.findIndex((node) => node.id === id); const target = index + offset;
    if (target < 0 || target >= nodes.length) return;
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]]; updatePage({ nodes });
  }
  function duplicatePage() {
    if (doc.pages.length >= 9) return;
    const next = { ...page, id: uid(), name: `${page.name.slice(0, 113)} copy` };
    change({ ...doc, pages: [...doc.pages, next] }); setPageId(next.id);
  }
  function applyVariant(variant: Variant) {
    change(variant.document); setBrandId(undefined); setPageId(variant.document.pages[0].id); setSelectedId(null);
    setSelectedVariantId(variant.id); selectedVariantRef.current = variant.id;
    // Choosing a direction is an explicit edit; later passes must not switch it.
    generationSnapshot.current = ""; autoAppliedDocument.current = "";
    setNotice(reviewNeedsAttention(variant) ? `${variant.name} applied. Review issues before export.` : `${variant.name} applied. Undo returns to your previous design.`);
  }
  function locateReviewIssue(issue: ReviewIssue) {
    const target = doc.pages.find((item) => item.id === issue.pageId);
    if (!target) return;
    setPageId(target.id); setSelectedId(target.nodes.some((node) => node.id === issue.nodeId) ? issue.nodeId! : null);
    setRightTab("properties");
  }
  function reviewFinding(issue: ReviewIssue, key: string, category: string, suggestion?: string) {
    const reviewedPage = reviewVariant?.document.pages.find((item) => item.id === issue.pageId);
    const reviewedNode = reviewedPage?.nodes.find((item) => item.id === issue.nodeId);
    return <li key={key} className={`${styles.reviewFinding} ${issue.severity === "error" ? styles.reviewError : styles.reviewWarning}`}>
      <div><span className={styles.severity}>{issue.severity}</span><span>{category.replaceAll("_", " ")}</span></div>
      <p>{issue.message}</p>
      {suggestion && <p className={styles.reviewSuggestion}><strong>Suggested change</strong>{suggestion}</p>}
      <button onClick={() => locateReviewIssue(issue)} disabled={!doc.pages.some((item) => item.id === issue.pageId)} title="Locate the referenced slide or layer">{reviewedPage?.name ?? issue.pageId}{reviewedNode ? ` · ${reviewedNode.name}` : ""}<ArrowUp size={12} /></button>
    </li>;
  }
  const numberField = (label: string, key: keyof DesignNode, min: number, max: number, step = 1) => selected && <Field label={label}><input type="number" min={min} max={max} step={step} disabled={selected.locked} value={Number(selected[key])} onChange={(event) => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) updateNode(selected.id, { [key]: Math.max(min, Math.min(max, value)), ...(key === "strokeWidth" && value > 0 && selected.stroke === "transparent" ? { stroke: doc.brand.secondary } : {}) }); }} /></Field>;

  return <main className={styles.studio}>
    <header className={styles.topbar}>
      <Link href="/studio" className={styles.back} aria-label="Back to launch studio"><ArrowLeft size={18} /></Link>
      <div className={styles.wordmark}>ease<span>your</span>startup<span className={styles.brandDot}>.</span></div>
      <div className={styles.productName}>Design studio <span>AI</span></div>
      <div className={styles.topSpacer} />
      <Tool label="Undo (Ctrl Z)" onClick={undo} disabled={!history.past.length}><ArrowCounterClockwise size={19} /></Tool>
      <Tool label="Redo (Ctrl Shift Z)" onClick={redo} disabled={!history.future.length}><ArrowClockwise size={19} /></Tool>
      <button className={styles.secondaryButton} onClick={() => void save()} disabled={saving || !ready}><FloppyDisk size={16} /><span>{saving ? "Saving…" : "Save"}</span></button>
      <button className={styles.primaryButton} onClick={() => { setRightTab("export"); setMobilePanel("details"); }}><DownloadSimple size={17} /><span>Export</span></button>
    </header>
    <nav className={styles.mobileNav} aria-label="Workspace panels">{["brief", "canvas", "details"].map((panel) => <button key={panel} aria-pressed={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{panel === "brief" ? "Create & refine" : panel === "details" ? "Layers & properties" : "Canvas"}</button>)}</nav>
    <div className={styles.workspace}>
      <aside className={`${styles.leftPanel} ${mobilePanel === "brief" ? styles.mobileVisible : ""}`}>
        <div className={styles.panelIntro}><span className={styles.eyebrow}>YOUR CREATIVE PARTNER</span><h1>From a thought.<br />To a statement<span>.</span></h1><p>Give your next big thing a visual voice.</p></div>
        <div className={styles.tabs} role="tablist" aria-label="Creative tools">{["brief", "brand", "assets", "chat"].map((tab) => <button key={tab} role="tab" aria-selected={leftTab === tab} onClick={() => setLeftTab(tab)}>{tab === "chat" ? "Refine" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
        <div className={styles.panelBody}>
          {leftTab === "brief" && <>
            <Field label="What are we making?"><textarea className={styles.briefInput} maxLength={6000} value={prompt} placeholder="A premium Instagram poster announcing our new Groq integration. Confident typography. A little unexpected." onChange={(event) => setPrompt(event.target.value)} /></Field>
            <div className={styles.promptHint}><Sparkle size={15} /><span>A clear message. An audience. A feeling. Start there.</span></div>
            <Field label="Format"><select value={formats} onChange={(event) => { const value = event.target.value; setFormats(value); const preset = CANVAS_PRESETS[value as keyof typeof CANVAS_PRESETS]; if (preset) { setWidth(preset[0]); setHeight(preset[1]); } }}><option value="portrait">Instagram portrait · 4:5</option><option value="square">Instagram square · 1:1</option><option value="story">Instagram story · 9:16</option><option value="landscape">Landscape · 16:9</option><option value="custom">Custom size</option></select></Field>
            {formats === "custom" && <div className={styles.fieldGrid}><Field label="Width"><input type="number" min={320} max={4096} value={width} onChange={(event) => setWidth(Math.max(320, Math.min(4096, +event.target.value)))} /></Field><Field label="Height"><input type="number" min={320} max={4096} value={height} onChange={(event) => setHeight(Math.max(320, Math.min(4096, +event.target.value)))} /></Field></div>}
            <div className={styles.fieldGrid}><Field label="Directions"><select value={variantCount} onChange={(event) => setVariantCount(+event.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? "direction" : "directions"}</option>)}</select></Field><Field label="Slides"><select value={slideCount} onChange={(event) => setSlideCount(+event.target.value)}>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {i === 0 ? "slide" : "slides"}</option>)}</select></Field></div>
            <button className={`${styles.primaryButton} ${styles.generateButton}`} onClick={() => void generate()} disabled={!prompt.trim() || busyJob || busy || !ready}><Sparkle size={18} weight="fill" />{busy ? "Starting…" : busyJob ? "Creating your design…" : "Create design"}<ArrowUp size={17} /></button>
            <p className={styles.smallNote}>Built from editable typography, shapes, and your assets.</p>
            <div className={styles.sectionHeader}><span>YOUR DESIGNS</span><button disabled={saving} onClick={() => { change(emptyDesignDocument()); setSavedId(undefined); savedIdRef.current = undefined; setRevision(undefined); setBrandId(undefined); setVersions([]); setSelectedId(null); setSelectedVariantId(null); setVariants([]); setNotice("New canvas opened. Undo returns to your previous work."); }}>New</button></div>
            {!savedDesigns.length && <p className={styles.emptyNote}>Saved designs will live here.</p>}
            {savedDesigns.map((design) => <button key={design.id} className={styles.savedDesign} onClick={() => void openDesign(design.id)}><Square size={17} /><span>{design.title}<small>Revision {design.revision}</small></span><ArrowUp size={14} /></button>)}
          </>}
          {leftTab === "brand" && <>
            <Field label="Saved brand"><select value={brandId ?? ""} onChange={(event) => { const brand = brands.find((item) => item.id === event.target.value); setBrandId(brand?.id); if (brand) change({ ...doc, brand: brand.kit, assets: [...doc.assets, ...brand.assets.filter((asset) => !doc.assets.some((item) => item.id === asset.id))].slice(0, 12) }); }}><option value="">New brand profile</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
            <Field label="Brand name"><input value={doc.brand.name} maxLength={120} onChange={(event) => updateBrand({ name: event.target.value })} /></Field>
            <div className={styles.fieldGrid}>{(["primary", "secondary", "background"] as const).map((key) => <Field key={key} label={key}><input type="color" value={doc.brand[key] === "transparent" ? "#ffffff" : doc.brand[key]} onChange={(event) => updateBrand({ [key]: event.target.value })} /></Field>)}</div>
            {(["headingFont", "bodyFont"] as const).map((key) => <Field key={key} label={key === "headingFont" ? "Heading font" : "Body font"}><select value={doc.brand[key]} onChange={(event) => updateBrand({ [key]: event.target.value })}>{DESIGN_FONTS.map((font) => <option key={font}>{font}</option>)}</select></Field>)}
            <Field label="Personality"><textarea maxLength={1000} value={doc.brand.personality} onChange={(event) => updateBrand({ personality: event.target.value })} /></Field>
            <Field label="Spacing"><select value={doc.brand.spacing} onChange={(event) => updateBrand({ spacing: event.target.value as BrandKit["spacing"] })}>{["compact", "balanced", "generous"].map((spacing) => <option key={spacing}>{spacing}</option>)}</select></Field>
            <Field label="Approved visual motifs"><textarea maxLength={1000} value={doc.brand.motifs} onChange={(event) => updateBrand({ motifs: event.target.value })} /></Field>
            <Field label="Reference notes"><textarea maxLength={2000} value={doc.brand.references} onChange={(event) => updateBrand({ references: event.target.value })} /></Field>
            <Field label="Preferred formats (one per line)"><textarea value={doc.brand.formats.join("\n")} onChange={(event) => updateBrand({ formats: event.target.value.split("\n").slice(0, 12).map((line) => line.slice(0, 100)) })} /></Field>
            <Field label="Design memory (one preference per line)"><textarea value={doc.brand.memory.join("\n")} onChange={(event) => updateBrand({ memory: event.target.value.split("\n").slice(0, 20).map((line) => line.slice(0, 300)) })} /></Field>
            <button className={styles.primaryButton} disabled={saving} onClick={() => void saveBrand()}><FloppyDisk size={16} />Save brand profile</button>
          </>}
          {leftTab === "assets" && <>
            <p className={styles.panelDescription}>Your logos, photographs, and visual references. Reference images guide composition when vision is available.</p>
            <Field label="Asset type"><select value={assetKind} onChange={(event) => setAssetKind(event.target.value)}><option value="image">Photograph / image</option><option value="logo">Logo</option><option value="reference">Visual reference</option></select></Field>
            <Field label="What should we draw from this?"><textarea value={assetDescription} maxLength={600} onChange={(event) => setAssetDescription(event.target.value)} placeholder="E.g. the typographic scale and generous margins" /></Field>
            <label className={styles.upload}><UploadSimple size={23} /><strong>{uploading ? "Preparing your asset…" : "Choose an image"}</strong><span>PNG, JPEG, or WebP · up to 12 assets</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading || doc.assets.length >= 12} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
            <div className={styles.assetGrid}>{doc.assets.map((asset) => <div key={asset.id} className={styles.asset}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.dataUrl} alt={asset.name} /><strong>{asset.name}</strong><small>{asset.kind}</small><button disabled={page.nodes.length >= 100} onClick={() => addNode("image", asset.id)}>Add to canvas</button><button onClick={() => removeAsset(asset.id)}>Remove asset</button>
            </div>)}</div>
          </>}
          {leftTab === "chat" && <>
            <div className={styles.chatIntro}><Sparkle size={23} /><h2>A little more you.</h2><p>Ask for a precise change. Your existing composition is the starting point.</p></div>
            <div className={styles.messages}>{messages.map((message, index) => <div key={index} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}><span>{message.role === "user" ? "YOU" : "DESIGN ASSISTANT"}</span><p>{message.text}</p></div>)}</div>
            <Field label="Refine this design"><textarea maxLength={4000} value={editPrompt} onChange={(event) => setEditPrompt(event.target.value)} placeholder="Keep the layout. Make the headline more expressive and move the CTA lower." /></Field>
            <button className={styles.primaryButton} disabled={!editPrompt.trim() || busyJob || busy || !ready} onClick={() => void generate(true)}><Sparkle size={17} />Apply refinement</button>
          </>}
        </div>
        <button className={styles.providerLink} onClick={() => { setRightTab("settings"); setMobilePanel("details"); }}><Gear size={16} /><span>Models & generation settings</span><span>{providers.filter((item) => item.configured !== false && item.available !== false).length}</span></button>
      </aside>

      <section className={`${styles.centerPanel} ${mobilePanel === "canvas" ? styles.mobileVisible : ""}`}>
        <div className={styles.documentBar}><input aria-label="Design title" value={doc.title} maxLength={180} onChange={(event) => { if (event.target.value.trim()) change({ ...doc, title: event.target.value }); }} /><span>{savedId ? `Revision ${revision ?? 1}` : "Unsaved design"}</span><Tool label="Duplicate design and save a copy" disabled={saving || !ready} onClick={() => void save(true)}><Copy size={17} /></Tool></div>
        {(error || notice) && <div className={error ? styles.errorBanner : styles.noticeBanner} role={error ? "alert" : "status"}>{error && <WarningCircle size={17} />}<span>{error || notice}</span><button aria-label="Dismiss message" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
        {job && <div className={styles.jobStatus} role="status"><span className={busyJob ? styles.pulse : reviewAttention ? styles.issueDot : styles.statusDot} /><div><strong>{busyJob ? job.stage.replace(/[_-]/g, " ") : job.status === "completed" ? reviewAttention ? "Review issues before export" : "Composition rendered" : job.status === "cancelled" ? "Generation cancelled" : "Generation needs attention"}</strong><span>{busyJob ? "Your canvas stays editable while we work." : job.result?.variants.length ? `${job.result.variants.length} creative direction(s) rendered` : "Your existing design is safe."}</span></div>{busyJob ? <button disabled={busy} onClick={() => void jobAction("cancel")}>Cancel</button> : ["failed", "cancelled"].includes(job.status) ? <button disabled={busy} onClick={() => void jobAction("retry")}>Retry</button> : null}</div>}
        {!busyJob && reviewAttention && <div className={styles.reviewBanner} role="status"><WarningCircle size={17} /><span>Review issues before export. The latest rendered direction needs attention.</span><button onClick={() => { setRightTab("review"); setMobilePanel("details"); }}>View review</button></div>}
        <div className={styles.canvasHost} ref={canvasHost}>
          <DesignCanvas page={page} assets={doc.assets} selectedId={selectedId} onSelect={setSelectedId} onMove={(id, x, y) => updateNode(id, { x, y })} zoom={zoom} pan={pan} onPan={setPan} hand={hand} onInteraction={() => { generationSnapshot.current = ""; autoAppliedDocument.current = ""; }} />
          <div className={styles.canvasToolbar}><Tool label="Select and move layers" active={!hand} onClick={() => setHand(false)}><MouseSimple size={18} /></Tool><Tool label="Pan canvas" active={hand} onClick={() => setHand(true)}><Hand size={18} /></Tool><span /><Tool label="Zoom out" onClick={() => setZoom((value) => Math.max(.05, value - .05))}><Minus size={16} /></Tool><button className={styles.zoomValue} onClick={fitCanvas} title="Fit canvas">{Math.round(zoom * 100)}%</button><Tool label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + .05))}><Plus size={16} /></Tool><Tool label="Fit canvas" onClick={fitCanvas}><ArrowsOut size={17} /></Tool></div>
        </div>
        <div className={styles.pageStrip}>{doc.pages.map((item, index) => <button key={item.id} className={item.id === page.id ? styles.activePage : ""} onClick={() => { setPageId(item.id); setSelectedId(null); setPan({ x: 0, y: 0 }); }}><span>{String(index + 1).padStart(2, "0")}</span>{item.name}</button>)}<Tool label="Duplicate current slide" disabled={doc.pages.length >= 9} onClick={duplicatePage}><Plus size={17} /></Tool></div>
        {!!variants.length && <div className={styles.variantStrip}><span className={styles.eyebrow}>CREATIVE DIRECTIONS</span>{variants.map((variant, index) => <button key={variant.id} aria-pressed={selectedVariantId === variant.id} onClick={() => applyVariant(variant)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{variant.name}</strong><small>{reviewSummary(variant, busyJob)}</small></button>)}</div>}
      </section>

      <aside className={`${styles.rightPanel} ${mobilePanel === "details" ? styles.mobileVisible : ""}`}>
        <div className={styles.inspectorTabs}>{["properties", "layers", "review", "history"].map((tab) => <button key={tab} title={tab} aria-label={tab} aria-pressed={rightTab === tab} onClick={() => setRightTab(tab)}>{tab === "properties" ? <><Square size={15} />Design</> : tab === "layers" ? <><Stack size={15} />Layers</> : tab === "review" ? <>Review{reviewAttention && <span className={styles.issueDot} />}</> : <ClockCounterClockwise size={18} />}</button>)}</div>
        <div className={styles.panelBody}>
          {rightTab === "export" && reviewAttention && <div className={styles.reviewExportNotice}><WarningCircle size={20} /><strong>Review issues before export</strong><p>The latest rendered direction has unresolved errors or a visual score below 65.{!reviewMatchesDocument && " Your current canvas has changed since that review."}</p><button onClick={() => setRightTab("review")}>See findings and suggestions</button></div>}
          {rightTab === "review" && <>
            <div className={styles.sectionHeader}><span>DESIGN REVIEW</span>{latestReview && <span>Pass {latestReview.round + 1}</span>}</div>
            {!reviewVariant ? <p className={styles.panelDescription}>Generate a design to see its browser layout checks and visual feedback here.</p> : <>
              <h2 className={styles.reviewTitle}>{reviewVariant.name}</h2>
              {variants.length > 1 && <><Field label="Review direction"><select value={reviewVariant.id} onChange={(event) => { const variant = variants.find((item) => item.id === event.target.value); if (variant) applyVariant(variant); }}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></Field><p className={styles.smallNote}>Choosing a direction loads its composition onto the canvas.</p></>}
              {!reviewMatchesDocument && <p className={styles.reviewStale}>These findings describe the last rendered direction. Your canvas differs from that version. Ask for an AI refinement to review your edits.</p>}
              {!latestReview ? <p className={styles.panelDescription}>{busyJob ? "Browser checks and visual review are in progress. Your first composition remains editable." : "No review was returned for this direction."}</p> : <>
                {latestReview.visionStatus === "available" && latestReview.vision ? <div className={styles.reviewScore}><span>MODEL VISUAL SCORE</span><strong>{latestReview.vision.score}<small>/100</small></strong><p>{reviewAttention ? "Review issues before export." : "Read the findings before choosing your next refinement."}</p></div> : <div className={styles.reviewVisionStatus}><EyeSlash size={19} /><strong>{latestReview.visionStatus === "failed" ? "Visual review failed" : latestReview.visionStatus === "unavailable" ? "Visual review unavailable" : "Visual review pending"}</strong><p>{latestReview.visionStatus === "failed" ? "The vision model could not complete its review. Layout checks are shown below; no visual score is available." : latestReview.visionStatus === "unavailable" ? "No compatible vision model was available for this pass. Layout checks are shown below; no visual score was produced." : "No visual score has been returned for this pass."}</p></div>}
                <div className={styles.sectionHeader}><span>LAYOUT CHECKS</span><span>{latestReview.deterministic.length} {latestReview.deterministic.length === 1 ? "issue" : "issues"}</span></div>
                {latestReview.deterministic.length ? <ul className={styles.reviewFindings}>{latestReview.deterministic.map((issue, index) => reviewFinding(issue, `layout-${index}`, issue.code))}</ul> : <p className={styles.reviewClear}>No layout issues were reported in this render.</p>}
                {latestReview.visionStatus === "available" && latestReview.vision && <><div className={styles.sectionHeader}><span>VISUAL FEEDBACK</span><span>{latestReview.vision.issues.length} {latestReview.vision.issues.length === 1 ? "issue" : "issues"}</span></div>{latestReview.vision.issues.length ? <ul className={styles.reviewFindings}>{latestReview.vision.issues.map((issue, index) => reviewFinding(issue, `vision-${index}`, issue.category, issue.suggestion))}</ul> : <p className={styles.reviewClear}>The vision model reported no visual issues in this pass.</p>}</>}
              </>}
              {!!reviewWarnings.length && <><div className={styles.sectionHeader}><span>GENERATION WARNINGS</span></div><ul className={styles.reviewFindings}>{reviewWarnings.map((warning, index) => <li key={index} className={`${styles.reviewFinding} ${styles.reviewWarning}`}><span className={styles.severity}>warning</span><p>{warning}</p></li>)}</ul></>}
              <p className={styles.smallNote}>{reviewVariant.feedback.length} {reviewVariant.feedback.length === 1 ? "rendered pass" : "rendered passes"} recorded. Findings above come from the latest pass; warnings include the full generation.</p>
            </>}
          </>}
          {rightTab === "properties" && <>
            <div className={styles.sectionHeader}><span>CANVAS</span><span>{page.width} × {page.height}</span></div>
            <Field label="Slide name"><input maxLength={120} value={page.name} onChange={(event) => { if (event.target.value.trim()) updatePage({ name: event.target.value }); }} /></Field>
            <div className={styles.fieldGrid}><Field label="Width"><input type="number" min={320} max={4096} value={page.width} onChange={(event) => updatePage({ width: Math.max(320, Math.min(4096, Math.round(+event.target.value))) })} /></Field><Field label="Height"><input type="number" min={320} max={4096} value={page.height} onChange={(event) => updatePage({ height: Math.max(320, Math.min(4096, Math.round(+event.target.value))) })} /></Field></div>
            <Field label="Background"><input type="color" value={page.background === "transparent" ? "#ffffff" : page.background} onChange={(event) => updatePage({ background: event.target.value })} /></Field>
            <div className={styles.addTools}><button disabled={page.nodes.length >= 100} onClick={() => addNode("text")}><TextT size={18} />Text</button><button disabled={page.nodes.length >= 100} onClick={() => addNode("rect")}><Square size={18} />Shape</button><button disabled={page.nodes.length >= 100} onClick={() => addNode("ellipse")}>Ellipse</button></div>
            {doc.pages.length > 1 && <button className={styles.textButton} onClick={() => { change({ ...doc, pages: doc.pages.filter((item) => item.id !== page.id) }); setPageId(doc.pages.find((item) => item.id !== page.id)!.id); }}>Delete current slide</button>}
            <div className={styles.divider} />
            {!selected ? <div className={styles.selectionHint}><MouseSimple size={24} /><h3>Every detail is yours.</h3><p>Select a layer on the canvas to edit its typography, color, and position.</p></div> : <>
              <div className={styles.sectionHeader}><span>{selected.type.toUpperCase()} LAYER</span><Tool label={selected.locked ? "Unlock layer" : "Lock layer"} onClick={() => updateNode(selected.id, { locked: !selected.locked }, true)}>{selected.locked ? <LockKey size={16} /> : <LockKeyOpen size={16} />}</Tool></div>
              <Field label="Layer name"><input value={selected.name} disabled={selected.locked} maxLength={100} onChange={(event) => updateNode(selected.id, { name: event.target.value })} /></Field>
              {selected.type === "text" && <>
                <Field label="Text"><textarea disabled={selected.locked} maxLength={4000} value={selected.text} onChange={(event) => updateNode(selected.id, { text: event.target.value })} /></Field>
                <Field label="Typeface"><select disabled={selected.locked} value={selected.fontFamily} onChange={(event) => updateNode(selected.id, { fontFamily: event.target.value as DesignNode["fontFamily"] })}>{DESIGN_FONTS.map((font) => <option key={font}>{font}</option>)}</select></Field>
                <div className={styles.fieldGrid}>{numberField("Size", "fontSize", 8, 600)}<Field label="Weight"><select disabled={selected.locked} value={selected.fontWeight} onChange={(event) => updateNode(selected.id, { fontWeight: +event.target.value })}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => <option key={weight}>{weight}</option>)}</select></Field>{numberField("Line height", "lineHeight", .7, 3, .05)}{numberField("Letter spacing", "letterSpacing", -20, 60, .5)}</div>
                <div className={styles.alignment}>{["left", "center", "right"].map((align) => <button key={align} disabled={selected.locked} aria-pressed={selected.align === align} onClick={() => updateNode(selected.id, { align: align as DesignNode["align"] })}>{align}</button>)}</div>
              </>}
              <div className={styles.fieldGrid}>{numberField("X", "x", -4096, 8192)}{numberField("Y", "y", -4096, 8192)}{numberField("Width", "width", 1, 8192)}{numberField("Height", "height", 1, 8192)}{numberField("Rotation", "rotation", -360, 360)}{numberField("Opacity", "opacity", 0, 1, .05)}</div>
              <Field label="Fill / text color"><input disabled={selected.locked} type="color" value={selected.fill === "transparent" ? "#ffffff" : selected.fill} onChange={(event) => updateNode(selected.id, { fill: event.target.value })} /></Field>
              <label className={styles.checkbox}><input type="checkbox" checked={selected.fill === "transparent"} disabled={selected.locked} onChange={(event) => updateNode(selected.id, { fill: event.target.checked ? "transparent" : doc.brand.primary })} />Transparent fill</label>
              <div className={styles.fieldGrid}><Field label="Stroke"><input type="color" disabled={selected.locked} value={selected.stroke === "transparent" ? "#181818" : selected.stroke} onChange={(event) => updateNode(selected.id, { stroke: event.target.value })} /></Field>{numberField("Stroke width", "strokeWidth", 0, 100)}{numberField("Corner radius", "radius", 0, 2048)}</div>
              {selected.type === "path" && <Field label="SVG path"><textarea disabled={selected.locked} value={selected.path} onChange={(event) => updateNode(selected.id, { path: event.target.value })} /></Field>}
              {selected.type === "image" && <Field label="Image fit"><select disabled={selected.locked} value={selected.fit} onChange={(event) => updateNode(selected.id, { fit: event.target.value as DesignNode["fit"] })}><option>contain</option><option>cover</option></select></Field>}
              <div className={styles.sectionHeader}><span>ALIGN TO CANVAS</span></div><div className={styles.alignment}>{["Left", "Center", "Right"].map((label, index) => <button key={label} disabled={selected.locked} onClick={() => updateNode(selected.id, { x: index === 0 ? 0 : index === 1 ? Math.round((page.width - selected.width) / 2) : page.width - selected.width })}>{label}</button>)}</div><div className={styles.alignment}>{["Top", "Middle", "Bottom"].map((label, index) => <button key={label} disabled={selected.locked} onClick={() => updateNode(selected.id, { y: index === 0 ? 0 : index === 1 ? Math.round((page.height - selected.height) / 2) : page.height - selected.height })}>{label}</button>)}</div>
              <div className={styles.addTools}><button disabled={selected.locked || page.nodes.length >= 100} onClick={() => { const copy = { ...selected, id: uid(), name: `${selected.name.slice(0, 93)} copy`, x: Math.min(8192, selected.x + 20), y: Math.min(8192, selected.y + 20) }; updatePage({ nodes: [...page.nodes, copy] }); setSelectedId(copy.id); }}><Copy size={16} />Duplicate</button><button disabled={selected.locked || page.nodes.length <= 1} onClick={() => { updatePage({ nodes: page.nodes.filter((node) => node.id !== selected.id) }); setSelectedId(null); }}><Trash size={16} />Delete</button></div>
            </>}
          </>}
          {rightTab === "layers" && <><div className={styles.sectionHeader}><span>LAYERS</span><span>{page.nodes.length}</span></div><p className={styles.smallNote}>Topmost layer appears first.</p>{[...page.nodes].reverse().map((node) => <div key={node.id} className={`${styles.layer} ${node.id === selectedId ? styles.activeLayer : ""}`}><button className={styles.layerName} onClick={() => { setSelectedId(node.id); setRightTab("properties"); }}>{node.type === "text" ? <TextT size={16} /> : <Square size={16} />}<span>{node.name}</span></button><Tool label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`} onClick={() => updateNode(node.id, { visible: !node.visible }, true)}>{node.visible ? <Eye size={15} /> : <EyeSlash size={15} />}</Tool><Tool label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`} onClick={() => updateNode(node.id, { locked: !node.locked }, true)}>{node.locked ? <LockKey size={15} /> : <LockKeyOpen size={15} />}</Tool><Tool label={`Bring ${node.name} forward`} disabled={node.locked || page.nodes.at(-1)?.id === node.id} onClick={() => reorder(node.id, 1)}><ArrowUp size={14} /></Tool><Tool label={`Send ${node.name} backward`} disabled={node.locked || page.nodes[0].id === node.id} onClick={() => reorder(node.id, -1)}><ArrowUp size={14} style={{ transform: "rotate(180deg)" }} /></Tool></div>)}</>}
          {rightTab === "history" && <><div className={styles.sectionHeader}><span>VERSION HISTORY</span>{savedId && <button onClick={() => void refreshVersions(savedId)}>Refresh</button>}</div><p className={styles.panelDescription}>Saved revisions are snapshots. Restoring one keeps your current version available through Undo.</p>{!versions.length && <p className={styles.emptyNote}>Save a design, then refresh to view its saved revisions.</p>}{versions.map((version) => <button key={version.id} className={styles.version} onClick={() => { change(version.document); setBrandId(undefined); setPageId(version.document.pages[0].id); setNotice(`Restored revision ${version.revision}. Save to keep it as a new revision.`); }}><ClockCounterClockwise size={18} /><span>Revision {version.revision}<small>{new Date(version.createdAt).toLocaleString()}</small></span></button>)}<div className={styles.divider} /><p className={styles.smallNote}>{history.past.length} local undo steps available.</p></>}
          {rightTab === "export" && <><div className={styles.sectionHeader}><span>EXPORT DESIGN</span><DownloadSimple size={18} /></div><h2 className={styles.exportHeading}>Out into<br />the world<span>.</span></h2><Field label="File type"><select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}><option value="png">PNG image · current slide</option><option value="zip">ZIP · all slides</option><option value="html">HTML · current slide</option><option value="json">Editable document · JSON</option></select></Field><Field label="Resolution"><select value={exportScale} onChange={(event) => setExportScale(+event.target.value)}><option value={1}>1× · {page.width} × {page.height}</option><option value={2}>2× · {page.width * 2} × {page.height * 2}</option></select></Field><button className={styles.primaryButton} disabled={exporting || (exportFormat !== "json" && !exportEntitlements.highResolutionExports)} onClick={() => void exportDesign()}><DownloadSimple size={17} />{exporting ? "Preparing export…" : "Download design"}</button><p className={styles.smallNote}>Exports use the same document, coordinates, and typography as your canvas.{exportEntitlements.watermarked && " Published exports include an EaseYourStartup watermark."}</p>{!exportEntitlements.highResolutionExports && <p className={styles.smallNote}>PNG, HTML and ZIP exports are available on <Link href="/pricing">Pro Lite and Pro</Link>. You can download an editable JSON backup on your current plan.</p>}</>}
          {rightTab === "settings" && <>
            <div className={styles.sectionHeader}><span>GENERATION SETTINGS</span><Gear size={18} /></div>
            {providerSettings.enabled === false && <p role="status" className={styles.errorBanner}>AI generation is paused by the administrator.</p>}
            {providerSettings.configurationError && <p role="alert" className={styles.errorBanner}>The server model registry needs attention.</p>}
            <Field label="Preferred provider"><select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="">Automatic · match task capabilities</option>
              {providers.map((item) => <option key={item.id} value={item.id} disabled={!item.configured || item.status === "disabled"}>{item.name ?? item.id}</option>)}
            </select></Field>
            <Field label="Maximum review rounds"><input type="number" min={0} max={3} value={revisionLimit} onChange={(event) => setRevisionLimit(Math.max(0, Math.min(3, +event.target.value)))} /></Field>
            <Field label="Token budget"><input type="number" min={4000} max={200000} step={1000} value={tokenBudget} onChange={(event) => setTokenBudget(Math.max(4000, Math.min(200000, +event.target.value)))} /></Field>
            <p className={styles.panelDescription}>Automatic routing matches each stage to a configured model. Live provider status reflects this server process; workspace usage below persists across restarts.</p>
            {providers.map((item) => <div key={item.id} className={styles.providerCard}>
              <strong>{item.name ?? item.id}</strong><small>{item.status?.replaceAll("_", " ") ?? "Unknown status"}</small>
              {item.models?.map((model) => <p key={model.id}><strong>{model.id}</strong><small>{model.tasks.join(" · ")}<br />{model.vision ? "Vision · " : ""}{model.structuredOutput ? "Structured output · " : ""}{model.streaming ? "Streaming" : ""}</small></p>)}
              {item.telemetry && <small>{item.telemetry.requests} requests · {item.telemetry.inputTokens + item.telemetry.outputTokens} tokens · {item.telemetry.failures} failures</small>}
            </div>)}
            {!providers.length && <p className={styles.emptyNote}>Configure the server model registry to generate designs. Setup: docs/design-studio.md.</p>}
            {!!usage.length && <details className={styles.usage}><summary>Workspace usage · past 30 days</summary><pre>{JSON.stringify(usage, null, 2)}</pre></details>}
            {job?.result?.usage && <details className={styles.usage}><summary>Latest generation usage</summary><pre>{JSON.stringify(job.result.usage, null, 2)}</pre></details>}
          </>}
        </div>
        <div className={styles.inspectorFooter}><span className={styles.statusDot} />{ready ? "Local draft recovery enabled" : "Opening your workspace…"}</div>
      </aside>
    </div>
  </main>;
}
