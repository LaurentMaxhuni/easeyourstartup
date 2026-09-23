"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Code,
  FileText,
  GlobeSimple,
  Images,
  Lightning,
  Plus,
  Sparkle,
  TrendUp,
} from "@phosphor-icons/react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { authClient } from "@/lib/auth/client";
import { CHANNEL_LABELS } from "@/lib/channels";
import {
  studioStateSchema,
  type StudioState,
} from "@/lib/contracts";
import { getStudioProgress, STUDIO_STAGES } from "@/lib/studio-flow";
import { cn } from "@/lib/utils";

type DashboardStateResponse = {
  state?: unknown;
  storageKey?: string;
};

type DashboardProject = {
  id: string;
  name: string;
  publicUrl: string | null;
  status: "active" | "archived";
  sourcePageCount: number;
  campaignCount: number;
  campaigns: Array<{ id: string; title: string; status: string; updatedAt: string | null }>;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DashboardProjectsResponse = {
  projects?: DashboardProject[];
};

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatProjectDate(value: string | null) {
  if (!value) return "Not scanned yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return `Scanned ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

function readLocalState(storageKey: string | undefined) {
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = studioStateSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function stageComplete(state: StudioState, id: (typeof STUDIO_STAGES)[number]["id"]) {
  if (id === "scan") return Boolean(state.scan);
  if (id === "brand") return Boolean(state.brand);
  if (id === "campaign") return Boolean(state.generation);
  return Boolean(state.generation && state.composition.codeBundle);
}

export function DashboardShell({ storageKey }: { storageKey: string }) {
  const [state, setState] = useState<StudioState | null>(null);
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const [stateResult, projectsResult] = await Promise.allSettled([
        fetch("/api/studio/state", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);
      const issues: string[] = [];

      if (stateResult.status === "fulfilled" && stateResult.value.ok) {
        try {
          const data = (await stateResult.value.json()) as DashboardStateResponse;
          const parsed = studioStateSchema.safeParse(data.state);
          const nextState = parsed.success
            ? parsed.data
            : readLocalState(data.storageKey);
          if (!cancelled) setState(nextState);
          if (!parsed.success && data.state !== null && data.state !== undefined) {
            issues.push("The saved launch summary could not be read.");
          }
        } catch {
          if (!cancelled) setState(readLocalState(storageKey));
          issues.push("The saved launch summary could not be read.");
        }
      } else if (!cancelled) {
        setState(readLocalState(storageKey));
        issues.push("The saved launch summary could not be loaded.");
      }

      if (projectsResult.status === "fulfilled" && projectsResult.value.ok) {
        try {
          const data = (await projectsResult.value.json()) as DashboardProjectsResponse;
          if (!Array.isArray(data.projects)) throw new Error("Project response was invalid.");
          if (!cancelled) {
            setProjects(data.projects);
            setProjectsFailed(false);
          }
        } catch {
          if (!cancelled) setProjectsFailed(true);
          issues.push("Your project list could not be read.");
        }
      } else {
        if (!cancelled) setProjectsFailed(true);
        issues.push("Your project list could not be loaded.");
      }

      if (!cancelled) {
        setLoadError(issues.join(" "));
        setLoading(false);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, storageKey]);

  const project = state?.brand ?? state?.scan?.profile ?? null;
  const progress = state ? getStudioProgress(state.step) : null;
  const approvedClaims =
    state?.brand?.claims.filter((claim) => claim.approvalState !== "rejected")
      .length ?? 0;
  const totalClaims = state?.brand?.claims.length ?? 0;
  const sourcePages = state?.scan?.pages.length ?? 0;
  const generatedPosts = state?.outputs.length ?? 0;
  const hasCode = Boolean(state?.composition.codeBundle);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <DashboardHeader />

      <main id="dashboard-content" tabIndex={-1}>
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <section className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-accent">
                Launch desk
              </p>
              <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.065em] sm:text-5xl">
                Make the next launch easier.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">
                Keep your source, curated facts, campaign copy, and editable
                launch visuals in one place.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/studio?new=1">
                <Plus size={18} weight="bold" />
                Start a new launch
              </Link>
            </Button>
          </section>

          {loading ? (
            <DashboardLoadingState />
          ) : (
            <>
              {loadError && (
                <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger/30 bg-danger/5 p-4 text-sm">
                  <p className="text-danger">{loadError}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => { setLoading(true); setReloadKey((value) => value + 1); }}>
                    Retry
                  </Button>
                </div>
              )}
              {projectsFailed ? (
                <section className="mt-8 rounded-container border border-dashed border-line bg-surface-raised p-6" aria-labelledby="projects-heading">
                  <h2 id="projects-heading" className="text-lg font-semibold">Projects are unavailable</h2>
                  <p className="mt-2 text-sm text-muted">Your projects are still saved. Retry to load them.</p>
                </section>
              ) : (
                <ProjectsSection projects={projects} />
              )}
              {state && project && progress ? (
                <SavedLaunchDashboard
                  state={state}
                  project={project}
                  progress={progress}
                  approvedClaims={approvedClaims}
                  totalClaims={totalClaims}
                  sourcePages={sourcePages}
                  generatedPosts={generatedPosts}
                  hasCode={hasCode}
                />
              ) : (
                <EmptyDashboard />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProjectsSection({ projects }: { projects: DashboardProject[] }) {
  return (
    <section className="mt-8" aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.16em] text-accent">
            Workspace
          </p>
          <h2 id="projects-heading" className="mt-2 text-2xl font-semibold tracking-[-0.05em]">
            Your projects
          </h2>
        </div>
        <Badge>{projects.filter((project) => project.status === "active").length} active projects</Badge>
      </div>

      {projects.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-container border border-dashed border-line bg-surface-raised p-6">
          <p className="text-sm font-semibold">No saved projects yet</p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
            Sign in, scan a public product URL, and the launch workspace will appear here with its source pages and campaign count.
          </p>
        </div>
      )}
    </section>
  );
}

function ProjectCard({ project }: { project: DashboardProject }) {
  const [name, setName] = useState(project.name);
  const [campaigns, setCampaigns] = useState(project.campaigns);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(project.status);
  const [deleted, setDeleted] = useState(false);
  const sourceHost = project.publicUrl ? hostFromUrl(project.publicUrl) : "No source URL";

  async function deleteProject() {
    if (!window.confirm("Delete this project, its campaigns, and saved editor work? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Project could not be deleted.");
      setDeleted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProject(input: { name?: string; status?: "active" | "archived" }) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json() as { project?: { name: string; status: "active" | "archived" }; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error || "Project could not be updated.");
      setName(result.project.name);
      setStatus(result.project.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function updateCampaign(campaignId: string, input: { title?: string; status?: "archived" | "restored" }) {
    const response = await fetch(`/api/projects/${project.id}/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json() as { campaign?: { id: string; title: string; status: string }; error?: string };
    if (!response.ok || !result.campaign) throw new Error(result.error || "Campaign could not be updated.");
    setCampaigns((current) => current.map((campaign) => campaign.id === campaignId
      ? { ...campaign, title: result.campaign!.title, status: result.campaign!.status }
      : campaign));
  }

  if (deleted) return null;

  return (
    <article className="group rounded-container border border-line bg-surface-raised p-5 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-10 items-center justify-center rounded-control bg-accent/10 text-accent">
          <GlobeSimple size={19} />
        </span>
        <Badge className={status === "active" ? "border-accent/20 bg-accent/10 text-accent" : ""}>{status}</Badge>
      </div>
      <h3 className="mt-5 truncate text-lg font-semibold tracking-[-0.035em]" title={project.name}>
        {name}
      </h3>
      <p className="mt-1 truncate text-xs text-muted" title={project.publicUrl ?? undefined}>
        {sourceHost}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4">
        <div>
          <p className="font-sans text-lg font-semibold tracking-[-0.04em]">{project.sourcePageCount}</p>
          <p className="mt-1 text-[10px] text-muted">Source pages</p>
        </div>
        <div>
          <p className="font-sans text-lg font-semibold tracking-[-0.04em]">{campaigns.length}</p>
          <p className="mt-1 text-[10px] text-muted">Campaigns</p>
        </div>
      </div>
      {campaigns.length > 0 && (
        <div className="mt-4 space-y-2" aria-label="Recent campaigns">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="flex items-center gap-2 rounded-control px-2 py-2 text-xs hover:bg-canvas">
              {campaign.status === "archived" ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-muted">{campaign.title || "Untitled campaign"} <span className="ml-1">(archived)</span></span>
                  <button className="shrink-0 text-accent" onClick={() => void updateCampaign(campaign.id, { status: "restored" }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Campaign could not be restored."))}>Restore</button>
                </>
              ) : (
                <>
                  <Link
                    href={`/studio?projectId=${encodeURIComponent(project.id)}&campaignId=${encodeURIComponent(campaign.id)}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3"
                  >
                    <span className="truncate font-medium">{campaign.title || "Untitled campaign"}</span>
                    <span className="shrink-0 capitalize text-muted">{campaign.status}</span>
                  </Link>
                  <details className="relative">
                    <summary className="cursor-pointer px-1 text-muted" aria-label={`Edit ${campaign.title || "campaign"}`}>•••</summary>
                    <div className="absolute right-0 z-10 mt-2 w-48 rounded-control border border-line bg-surface-raised p-3 shadow-lg">
                      <button className="block w-full py-1 text-left" onClick={() => {
                        const title = window.prompt("Campaign name", campaign.title);
                        if (title?.trim()) void updateCampaign(campaign.id, { title: title.trim() }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Campaign could not be updated."));
                      }}>Rename campaign</button>
                      <button className="block w-full py-1 text-left text-danger" onClick={() => {
                        if (window.confirm("Archive this campaign? You can restore it later.")) void updateCampaign(campaign.id, { status: "archived" }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Campaign could not be archived."));
                      }}>Archive campaign</button>
                    </div>
                  </details>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <details className="mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs text-muted">Project settings</summary>
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void updateProject({ name }); }}>
          <input aria-label="Project name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 py-2 text-xs" />
          <Button size="sm" variant="secondary" disabled={busy}>Save</Button>
        </form>
        <button className="mt-3 text-xs text-danger" disabled={busy} onClick={() => {
          if (status === "archived") void updateProject({ status: "active" });
          else if (window.confirm("Archive this project? Its data will remain saved.")) void updateProject({ status: "archived" });
        }}>{status === "archived" ? "Restore project" : "Archive project"}</button>
        <button className="ml-4 mt-3 text-xs text-danger" disabled={busy} onClick={() => void deleteProject()}>Delete project and its data</button>
        {message && <p role="alert" className="mt-2 text-xs text-danger">{message}</p>}
      </details>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted">{formatProjectDate(project.lastScannedAt)}</span>
        <div className="flex gap-2">
          {status === "active" && <Button asChild size="sm"><Link href={`/studio?projectId=${encodeURIComponent(project.id)}&newCampaign=1`}>New campaign</Link></Button>}
          <Button asChild variant="secondary" size="sm">
            <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
              Open
              <ArrowRight size={14} />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function DashboardHeader() {
  return (
    <header className="border-b border-line bg-canvas/95 backdrop-blur-xl">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-5">
          <Logo href="/dashboard" ariaLabel="EaseYourStartup dashboard" />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <nav aria-label="Workspace navigation" className="hidden items-center gap-5 text-sm md:flex">
            <Link href="/dashboard" className="font-semibold text-ink">
              Dashboard
            </Link>
            <Link href="/studio" className="text-muted transition-colors hover:text-ink">
              Launch studio
            </Link>
            <Link href="/settings/billing" className="text-muted transition-colors hover:text-ink">
              Billing
            </Link>
            <Link href="/settings/account" className="text-muted transition-colors hover:text-ink">
              Account
            </Link>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-control px-2 py-2 text-xs text-muted transition-colors hover:text-ink"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/");
            }}
          >
            Sign out
          </button>
          <Button asChild size="sm">
            <Link href="/studio?new=1">
              <Plus size={15} weight="bold" />
              <span className="hidden sm:inline">New launch</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function DashboardLoadingState() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex min-h-48 items-center justify-center rounded-container border border-line bg-surface-raised">
        <LoadingIndicator label="Loading your launch desk" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-container border border-line bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

function SavedLaunchDashboard({
  state,
  project,
  progress,
  approvedClaims,
  totalClaims,
  sourcePages,
  generatedPosts,
  hasCode,
}: {
  state: StudioState;
  project: NonNullable<StudioState["brand"]>;
  progress: ReturnType<typeof getStudioProgress>;
  approvedClaims: number;
  totalClaims: number;
  sourcePages: number;
  generatedPosts: number;
  hasCode: boolean;
}) {
  const currentStage =
    STUDIO_STAGES.find((stage) => stage.id === state.step) ?? STUDIO_STAGES[0];
  const sourceUrl = state.scan?.pages[0]?.url ?? "";

  return (
    <>
      <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <article className="relative overflow-hidden rounded-container border border-line bg-[#0b286f] p-6 text-[#f4f3ef] sm:p-8">
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-white/20 bg-white/10 text-[#d2ddf5]">
                Current launch
              </Badge>
              {state.generation?.mode === "ai" && (
                <Badge className="border-[#8aa8ff]/40 bg-[#8aa8ff]/15 text-[#d2ddf5]">
                  <Sparkle size={12} weight="fill" className="mr-1" />
                  AI assisted
                </Badge>
              )}
            </div>
            <h2 className="mt-6 max-w-2xl text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
              {project.projectName}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#d2ddf5]">
              {project.tagline || "Your source-backed launch workspace is ready to continue."}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="border-white bg-white text-[#0b286f] hover:bg-[#eef3ff]">
                <Link href="/studio">
                  Continue launch
                  <ArrowRight size={18} />
                </Link>
              </Button>
              {sourceUrl && (
                <span className="inline-flex max-w-full items-center gap-2 truncate text-xs text-[#b9d0ff]">
                  <GlobeSimple size={15} />
                  {hostFromUrl(sourceUrl)}
                </span>
              )}
            </div>
          </div>
        </article>

        <ProgressCard
          state={state}
          progress={progress}
          currentStage={currentStage}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={GlobeSimple}
          label="Source pages"
          value={sourcePages}
          detail="Mapped from your site"
        />
        <StatCard
          icon={CheckCircle}
          label="Source facts"
          value={`${approvedClaims}/${totalClaims}`}
          detail="Ready for copy"
        />
        <StatCard
          icon={FileText}
          label="Posts ready"
          value={generatedPosts}
          detail="Across your channels"
        />
        <StatCard
          icon={Code}
          label="Editable prototype"
          value={hasCode ? "Ready" : "Next"}
          detail={hasCode ? "HTML, CSS, and JS" : "Generate in the studio"}
        />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <LaunchChecklist state={state} />
        <PostsCard state={state} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <SourcesCard state={state} />
        <BrandCard project={project} />
      </section>
    </>
  );
}

function ProgressCard({
  state,
  progress,
  currentStage,
}: {
  state: StudioState;
  progress: ReturnType<typeof getStudioProgress>;
  currentStage: (typeof STUDIO_STAGES)[number];
}) {
  return (
    <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Workflow
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            {currentStage.label}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            {currentStage.description}
          </p>
        </div>
          <span className="font-sans text-sm font-semibold text-accent">
          {progress.current}/{progress.total}
        </span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <ol className="mt-6 space-y-3">
        {STUDIO_STAGES.map((stage, index) => {
          const current = stage.id === state.step;
          const complete =
            !current &&
            (index < progress.current - 1 || stageComplete(state, stage.id));
          return (
            <li key={stage.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border font-sans text-[10px]",
                  complete
                    ? "border-accent bg-accent text-accent-ink"
                    : current
                      ? "border-accent text-accent"
                      : "border-line text-muted",
                )}
              >
                {complete ? <Check size={13} weight="bold" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-xs font-semibold", !current && !complete && "text-muted")}>
                  {stage.label}
                </span>
                <span className="block truncate text-[10px] text-muted">
                  {stage.description}
                </span>
              </span>
              {current && (
                <Badge className="ml-auto border-accent/30 bg-accent/10 text-accent">
                  Current
                </Badge>
              )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof GlobeSimple;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="rounded-container border border-line bg-surface-raised p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-control bg-accent/10 text-accent">
          <Icon size={18} />
        </span>
        <TrendUp size={16} className="text-muted" />
      </div>
          <p className="mt-5 font-sans text-2xl font-semibold tracking-[-0.04em]">
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold">{label}</p>
      <p className="mt-1 text-[10px] text-muted">{detail}</p>
    </article>
  );
}

function LaunchChecklist({ state }: { state: StudioState }) {
  const items = [
    {
      label: "Source scanned",
      detail: state.scan ? `${state.scan.pages.length} pages mapped` : "Paste a public URL",
      done: Boolean(state.scan),
      icon: GlobeSimple,
    },
    {
      label: "Facts kept",
      detail: state.brand
        ? `${state.brand.claims.filter((claim) => claim.approvalState !== "rejected").length} claims ready`
        : "Review the source-backed story",
      done: Boolean(state.brand),
      icon: CheckCircle,
    },
    {
      label: "Campaign generated",
      detail: state.generation ? `${state.outputs.length} channel drafts` : "Build your launch brief",
      done: Boolean(state.generation),
      icon: FileText,
    },
    {
      label: "Creative prototype",
      detail: state.composition.codeBundle ? "HTML, CSS, and JS ready" : "Design the launch visual",
      done: Boolean(state.composition.codeBundle),
      icon: Code,
    },
  ];

  return (
    <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Launch checklist
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            Keep the story moving
          </h2>
        </div>
        <Lightning size={20} weight="fill" className="text-accent" />
      </div>
      <div className="mt-6 space-y-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-control", item.done ? "bg-accent text-accent-ink" : "bg-surface text-muted")}>
                {item.done ? <Check size={15} weight="bold" /> : <Icon size={16} />}
              </span>
              <div className="min-w-0">
                <p className={cn("text-xs font-semibold", !item.done && "text-muted")}>
                  {item.label}
                </p>
                <p className="truncate text-[10px] text-muted">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function PostsCard({ state }: { state: StudioState }) {
  return (
    <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Recent outputs
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            Your campaign drafts
          </h2>
        </div>
        <Images size={20} className="text-accent" />
      </div>
      {state.outputs.length > 0 ? (
        <div className="mt-5 divide-y divide-line">
          {state.outputs.slice(0, 3).map((output) => (
            <div key={output.channel} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent/10 font-sans text-[10px] font-semibold text-accent">
                {CHANNEL_LABELS[output.channel].slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold">{CHANNEL_LABELS[output.channel]}</p>
                  <span className="text-[10px] text-muted">Draft ready</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                  {output.primaryCopy}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={FileText}
          title="No posts yet"
          detail="Your channel drafts will appear here after the brief is generated."
        />
      )}
      <Button asChild variant="secondary" size="sm" className="mt-6">
        <Link href="/studio">
          Open launch studio
          <ArrowRight size={15} />
        </Link>
      </Button>
    </article>
  );
}

function SourcesCard({ state }: { state: StudioState }) {
  const pages = state.scan?.pages ?? [];
  return (
    <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Source library
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            The facts behind the launch
          </h2>
        </div>
        <GlobeSimple size={20} className="text-accent" />
      </div>
      {pages.length > 0 ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {pages.slice(0, 4).map((page) => (
            <a
              key={page.url}
              href={page.url}
              target="_blank"
              rel="noreferrer"
              className="group rounded-control border border-line bg-canvas p-3 transition-colors hover:border-accent"
            >
              <p className="truncate text-xs font-semibold group-hover:text-accent">
                {page.title || hostFromUrl(page.url)}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted">
                {hostFromUrl(page.url)}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={GlobeSimple}
          title="No source connected"
          detail="Start with a public URL and we will build the source library for you."
        />
      )}
    </article>
  );
}

function BrandCard({ project }: { project: NonNullable<StudioState["brand"]> }) {
  return (
    <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
            Brand snapshot
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            {project.projectName}
          </h2>
        </div>
        <Sparkle size={20} className="text-accent" />
      </div>
      <p className="mt-5 text-sm leading-6 text-muted">
        {project.tagline || "Your curated source story will guide every campaign draft."}
      </p>
      <div className="mt-5 flex items-center gap-2">
        {project.colors.slice(0, 5).map((color) => (
          <span
            key={color}
            title={color}
            className="size-7 rounded-full border border-line"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {project.voice.slice(0, 4).map((voice) => (
          <Badge key={voice}>{voice}</Badge>
        ))}
      </div>
    </article>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof FileText;
  title: string;
  detail: string;
}) {
  return (
    <div className="mt-5 rounded-control border border-dashed border-line bg-canvas p-5">
      <Icon size={18} className="text-muted" />
      <p className="mt-3 text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted">{detail}</p>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <article className="relative overflow-hidden rounded-container border border-line bg-[#0b286f] p-6 text-[#f4f3ef] sm:p-8">
        <div className="relative max-w-xl">
          <Badge className="border-white/20 bg-white/10 text-[#d2ddf5]">
            First launch workspace
          </Badge>
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
            Start with the product you already built.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#d2ddf5]">
            Scan your public site, let the filter keep the useful facts, and turn the next update
            into channel-ready copy and editable HTML, CSS, and JavaScript.
          </p>
          <Button asChild size="lg" className="mt-7 border-white bg-white text-[#0b286f] hover:bg-[#eef3ff]">
            <Link href="/studio?new=1">
              Start your first launch
              <ArrowRight size={18} />
            </Link>
          </Button>
        </div>
      </article>

      <article className="rounded-container border border-line bg-surface-raised p-6 sm:p-8">
        <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-muted">
          Your workflow
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">
          Four focused steps
        </h2>
        <div className="mt-6 space-y-4">
          {STUDIO_STAGES.map((stage, index) => (
            <div key={stage.id} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line font-sans text-[10px] text-muted">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-semibold">{stage.label}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {stage.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
