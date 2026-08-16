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

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const response = await fetch("/api/studio/state", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Dashboard state unavailable.");

        const data = (await response.json()) as DashboardStateResponse;
        const parsed = studioStateSchema.safeParse(data.state);
        const nextState = parsed.success
          ? parsed.data
          : readLocalState(data.storageKey);

        if (!cancelled) setState(nextState);
      } catch {
        if (!cancelled) setState(readLocalState(storageKey));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const project = state?.brand ?? state?.scan?.profile ?? null;
  const progress = state ? getStudioProgress(state.step) : null;
  const approvedClaims =
    state?.brand?.claims.filter((claim) => claim.approvalState === "approved")
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
                Keep your source, approved facts, campaign copy, and editable
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
          ) : state && project && progress ? (
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
        </div>
      </main>
    </div>
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
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
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
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-28 size-72 rounded-full bg-[#5b83ff]/25 blur-3xl"
          />
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
          label="Approved facts"
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
      label: "Facts approved",
      detail: state.brand
        ? `${state.brand.claims.filter((claim) => claim.approvalState === "approved").length} claims ready`
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
        {project.tagline || "Your approved story will guide every campaign draft."}
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
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-16 size-64 rounded-full bg-[#5b83ff]/25 blur-3xl"
        />
        <div className="relative max-w-xl">
          <Badge className="border-white/20 bg-white/10 text-[#d2ddf5]">
            First launch workspace
          </Badge>
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">
            Start with the product you already built.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#d2ddf5]">
            Scan your public site, approve the facts, and turn the next update
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
