"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Archive,
  ArrowRight,
  CaretLeft,
  CaretRight,
  DotsThree,
  GlobeSimple,
  MagnifyingGlass,
  Plus,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectBrandSummary as ProjectBrand } from "@/lib/project-brand";
import { cn } from "@/lib/utils";

export type DashboardProject = {
  id: string;
  projectIds?: string[];
  name: string;
  publicUrl: string | null;
  status: "active" | "archived";
  sourcePageCount: number;
  campaignCount: number;
  campaigns: Array<{ id: string; projectId?: string; title: string; status: string; updatedAt: string | null }>;
  lastScannedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  brand?: ProjectBrand | null;
};

type Campaign = {
  id: string;
  projectId: string;
  projectName: string;
  projectStatus: "active" | "archived";
  title: string;
  kind: string;
  status: string;
  updatedAt: string | null;
};

type CampaignsResponse = {
  campaigns: Campaign[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type CampaignFilter = "active" | "archived" | "all";
type ProjectFilter = "active" | "archived" | "all";

function hostFromUrl(value: string | null) {
  if (!value) return "No source URL";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function formatDate(value: string | null, emptyLabel = "Not updated") {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusTone(status: string) {
  if (status === "completed" || status === "active") {
    return "border-accent/20 bg-accent/10 text-accent";
  }
  if (status === "failed") return "border-danger/30 bg-danger/5 text-danger";
  if (status === "generating" || status === "queued") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "";
}

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    feature_update: "Feature update",
    launch: "Launch",
    milestone: "Milestone",
    promotion: "Promotion",
    waitlist: "Waitlist",
  };
  return labels[kind] ?? "Custom campaign";
}

export function ProjectCampaignWorkspace({
  projects,
  onCampaignChange,
}: {
  projects: DashboardProject[];
  onCampaignChange: () => void;
}) {
  const [view, setView] = useState<"projects" | "campaigns">("projects");
  const [campaignProjectId, setCampaignProjectId] = useState("");
  const [campaignStatus, setCampaignStatus] = useState<CampaignFilter>("active");

  const activeProjectCount = projects.filter((project) => project.status === "active").length;
  const activeCampaignCount = projects.reduce((total, project) => total + project.campaignCount, 0);

  return (
    <section className="mt-10" aria-labelledby="workspace-heading">
      <div className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Your workspace</p>
          <h2 id="workspace-heading" className="mt-2 text-2xl font-semibold">
            {view === "projects" ? "Projects" : "Campaigns"}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            {view === "projects"
              ? "Pick a project to continue your campaign work."
              : "Find any campaign and see which project it belongs to."}
          </p>
        </div>

        <div className="inline-flex w-fit rounded-control border border-line bg-surface p-1" role="group" aria-label="Workspace view">
          <button
            type="button"
            aria-pressed={view === "projects"}
            onClick={() => setView("projects")}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition-colors motion-safe:active:scale-[0.97]",
              view === "projects" ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            Projects <span className="text-xs opacity-70">{activeProjectCount}</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "campaigns"}
            onClick={() => setView("campaigns")}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition-colors motion-safe:active:scale-[0.97]",
              view === "campaigns" ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            Campaigns <span className="text-xs opacity-70">{activeCampaignCount}</span>
          </button>
        </div>
      </div>

      <div hidden={view !== "projects"}>
        <ProjectsList
          projects={projects}
          onProjectUpdate={onCampaignChange}
          onProjectDelete={onCampaignChange}
        />
      </div>
      <div hidden={view !== "campaigns"}>
        <CampaignsList
          projects={projects}
          enabled={view === "campaigns"}
          projectId={campaignProjectId}
          onProjectIdChange={setCampaignProjectId}
          status={campaignStatus}
          onStatusChange={setCampaignStatus}
          onCampaignChange={onCampaignChange}
        />
      </div>
    </section>
  );
}

function ProjectsList({
  projects,
  onProjectUpdate,
  onProjectDelete,
}: {
  projects: DashboardProject[];
  onProjectUpdate: (projectId: string, update: Partial<DashboardProject>) => void;
  onProjectDelete: (projectId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const [sort, setSort] = useState<"updated" | "name">("updated");

  const visibleProjects = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return projects
      .filter((project) => filter === "all" || project.status === filter)
      .filter((project) => !search || project.name.toLocaleLowerCase().includes(search) || hostFromUrl(project.publicUrl).toLocaleLowerCase().includes(search))
      .sort((a, b) => sort === "name"
        ? a.name.localeCompare(b.name)
        : (Date.parse(b.updatedAt ?? b.lastScannedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? a.lastScannedAt ?? "") || 0));
  }, [filter, projects, query, sort]);

  return (
    <div className="pt-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative col-span-2 block sm:col-span-1">
          <span className="sr-only">Search projects</span>
          <MagnifyingGlass size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects or domains"
            className="min-h-10 w-full rounded-control border border-line bg-surface-raised py-2 pl-9 pr-3 text-sm placeholder:text-muted"
          />
        </label>
        <label className="sr-only" htmlFor="project-filter">Project status</label>
        <Select<ProjectFilter>
          id="project-filter"
          value={filter}
          onValueChange={setFilter}
          options={[{ value: "active", label: "Active projects" }, { value: "archived", label: "Archived projects" }, { value: "all", label: "All projects" }]}
          className="w-full sm:w-44"
        />
        <label className="sr-only" htmlFor="project-sort">Sort projects</label>
        <Select<"updated" | "name">
          id="project-sort"
          value={sort}
          onValueChange={setSort}
          options={[{ value: "updated", label: "Recently updated" }, { value: "name", label: "Name A–Z" }]}
          className="w-full sm:w-44"
        />
      </div>

      <p role="status" className="mt-4 text-xs text-muted">
        {visibleProjects.length} {filter === "all" ? "" : `${filter} `}{visibleProjects.length === 1 ? "project" : "projects"}{query.trim() ? " matching your search" : ""}
      </p>

      {visibleProjects.length > 0 ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onProjectUpdate={onProjectUpdate}
                onProjectDelete={onProjectDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="mt-4 rounded-container border border-dashed border-line bg-surface-raised p-6">
          <p className="text-sm font-semibold">
            {projects.length === 0 ? "No projects yet" : "No projects match this view"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {projects.length === 0
              ? "Create a project from a public product URL, then keep its campaign work here."
              : "Try another search or include archived projects."}
          </p>
          {projects.length === 0 && (
            <Button asChild size="sm" className="mt-4">
              <Link href="/studio?new=1"><Plus size={16} weight="bold" /> Start a project</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onProjectUpdate,
  onProjectDelete,
}: {
  project: DashboardProject;
  onProjectUpdate: (projectId: string, update: Partial<DashboardProject>) => void;
  onProjectDelete: (projectId: string) => void;
}) {
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const sourceHost = hostFromUrl(project.publicUrl);
  const latestCampaign = project.campaigns.find((campaign) => campaign.status !== "archived");

  async function updateProject(input: { name?: string; status?: "active" | "archived" }) {
    setBusy(true);
    setMessage("");
    try {
      let savedProject: { name: string; status: "active" | "archived" } | undefined;
      for (const id of project.projectIds ?? [project.id]) {
        const response = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const result = await response.json() as { project?: { name: string; status: "active" | "archived" }; error?: string };
        if (!response.ok || !result.project) throw new Error(result.error || "Project could not be updated.");
        if (id === project.id) savedProject = result.project;
      }
      if (!savedProject) throw new Error("Project could not be updated.");
      setName(savedProject.name);
      setDraftName(savedProject.name);
      setStatus(savedProject.status);
      setEditingName(false);
      if (input.name) window.requestAnimationFrame(() => settingsTriggerRef.current?.focus());
      onProjectUpdate(project.id, savedProject);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be updated.");
      onProjectUpdate(project.id, {});
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!window.confirm("Delete this project, its campaigns, and saved editor work? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Project could not be deleted.");
      onProjectDelete(project.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      layout={reduceMotion ? false : "position"}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      aria-label={name}
      aria-busy={busy}
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-container border border-line bg-surface-raised transition-[border-color,box-shadow,transform] duration-200 focus-within:border-accent/60 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_10px_30px_-18px_var(--accent-halo)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <ProjectCover name={name} brand={project.brand ?? null} archived={status === "archived"} />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <ProjectMark name={name} brand={project.brand ?? null} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-5" title={name}>
              {/* The link covers the whole card; the menu and rename form sit above it. */}
              <Link
                href={`/dashboard/projects/${encodeURIComponent(project.id)}`}
                className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {name}
              </Link>
            </h3>
            <p className="truncate text-xs leading-5 text-muted" title={project.brand?.tagline || project.publicUrl || undefined}>
              {project.brand?.tagline || sourceHost}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button ref={settingsTriggerRef} type="button" disabled={busy} aria-label={`Settings for ${name}`} className="relative z-10 -mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50 motion-safe:active:scale-95">
                <DotsThree size={20} weight="bold" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
              if (editingName) { event.preventDefault(); nameInputRef.current?.focus(); }
            }}>
              {status === "active" && (
                <DropdownMenuItem asChild>
                  <Link href={`/studio?projectId=${encodeURIComponent(project.id)}&newCampaign=1`}>
                    <Plus size={16} aria-hidden="true" /> New campaign
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
                  <ArrowRight size={16} aria-hidden="true" /> Open in studio
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setDraftName(name); setEditingName(true); }}>
                <PencilSimple size={16} aria-hidden="true" /> Rename project
              </DropdownMenuItem>
              {project.publicUrl && (
                <DropdownMenuItem asChild>
                  <a href={project.publicUrl} target="_blank" rel="noreferrer">
                    <GlobeSimple size={16} aria-hidden="true" /> Visit {sourceHost}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => {
                if (status === "archived") void updateProject({ status: "active" });
                else if (window.confirm("Archive this project? Its data will remain saved.")) void updateProject({ status: "archived" });
              }}>
                <Archive size={16} aria-hidden="true" /> {status === "archived" ? "Restore project" : "Archive project"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-danger" onSelect={() => void deleteProject()}>
                <Trash size={16} aria-hidden="true" /> Delete project and its data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-auto pt-4">
          {latestCampaign ? (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink" title={latestCampaign.title || "Untitled campaign"}>
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", campaignDotTone(latestCampaign.status))} />
              <span className="sr-only">Latest campaign, {latestCampaign.status}:</span>
              <span className="truncate">{latestCampaign.title || "Untitled campaign"}</span>
            </p>
          ) : (
            <p className="text-xs text-muted">{status === "active" ? "No campaigns yet" : "No active campaigns"}</p>
          )}
          <p className="mt-1 text-[11px] text-muted">
            {project.campaignCount} {project.campaignCount === 1 ? "campaign" : "campaigns"} · Updated {formatDate(project.updatedAt ?? project.lastScannedAt, "not yet")}
          </p>
        </div>

        <AnimatePresence initial={false}>
          {editingName && (
            <motion.form
              key="rename"
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.16 }}
              className="relative z-10 overflow-hidden"
              onSubmit={(event) => { event.preventDefault(); if (draftName.trim()) void updateProject({ name: draftName.trim() }); }}
            >
              <div className="mt-4 border-t border-line pt-4">
                <label className="mb-2 block text-xs font-medium" htmlFor={`project-name-${project.id}`}>Project name</label>
                <input
                  ref={nameInputRef}
                  autoFocus
                  id={`project-name-${project.id}`}
                  required
                  maxLength={120}
                  value={draftName}
                  disabled={busy}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="min-h-10 w-full rounded-control border border-line bg-canvas px-3 py-2 text-sm"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setEditingName(false); settingsTriggerRef.current?.focus(); }}>Cancel</Button>
                  <Button size="sm" disabled={busy || !draftName.trim()}>{busy ? "Saving…" : "Save name"}</Button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
        {busy && !editingName && <LoadingIndicator size="sm" label="Updating project" className="mt-3 text-xs text-muted" />}
        {message && <p role="alert" className="relative z-10 mt-3 text-xs text-danger">{message}</p>}
      </div>
    </motion.article>
  );
}

function campaignDotTone(status: string) {
  if (status === "failed") return "bg-danger";
  if (status === "completed") return "bg-accent";
  if (status === "generating" || status === "queued") return "bg-amber-500";
  return "bg-muted";
}

// Readable text on an arbitrary brand color.
function inkFor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#0b0b0b" : "#ffffff";
}

export function ProjectCover({ name, brand, archived }: { name: string; brand: ProjectBrand | null; archived: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  // Some sites point their share image at a logo; fit those whole instead of cropping.
  const [fitWhole, setFitWhole] = useState(false);
  const background = brand?.backgroundColor ?? null;
  const accent = brand?.accentColor ?? null;
  const coverImageUrl = imageFailed ? null : brand?.coverImageUrl ?? null;

  return (
    <div
      className={cn("relative aspect-[1.91/1] w-full overflow-hidden border-b border-line bg-surface", archived && "grayscale")}
      style={(!coverImageUrl || fitWhole) && background ? { backgroundColor: background } : undefined}
    >
      {coverImageUrl ? (
        // Open Graph images are remote and arbitrary in size, so a plain img is used.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            const ratio = naturalHeight > 0 ? naturalWidth / naturalHeight : 0;
            const logoLike = /logo|\.svg(?:$|\?)/i.test(coverImageUrl);
            // Photos crop well; wordmarks and off-shape vector art do not.
            setFitWhole(ratio > 2.4 || (logoLike && Math.abs(ratio - 1.91) > 0.3));
          }}
          className={cn(
            "size-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
            fitWhole ? "object-contain p-8" : "object-cover",
          )}
        />
      ) : (
        <div className="flex size-full items-center justify-center p-6">
          {accent && accent !== background && <span aria-hidden="true" className="absolute -bottom-10 -right-10 size-32 rounded-full opacity-80" style={{ backgroundColor: accent }} />}
          <span
            className="relative line-clamp-2 text-balance text-center text-lg font-semibold leading-tight"
            style={background ? { color: brand?.foregroundColor ?? inkFor(background) } : undefined}
          >
            {name}
          </span>
        </div>
      )}
      {archived && (
        <Badge className="absolute left-3 top-3 border-line bg-surface-raised/90 text-muted backdrop-blur">Archived</Badge>
      )}
    </div>
  );
}

export function ProjectMark({ name, brand }: { name: string; brand: ProjectBrand | null }) {
  const [iconFailed, setIconFailed] = useState(false);
  const initial = name.trim().slice(0, 1).toLocaleUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-canvas text-sm font-semibold text-accent"
    >
      {brand?.faviconUrl && !iconFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.faviconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIconFailed(true)} className="size-6 object-contain" />
      ) : initial || <GlobeSimple size={18} />}
    </span>
  );
}

// With fixedProject, the list shows one project's campaigns and offers a new
// campaign for it instead of the project filter and column.
export function CampaignsList({
  projects,
  enabled,
  projectId,
  onProjectIdChange,
  status,
  onStatusChange,
  onCampaignChange,
  fixedProject,
}: {
  projects: DashboardProject[];
  enabled: boolean;
  projectId: string;
  onProjectIdChange: (projectId: string) => void;
  status: CampaignFilter;
  onStatusChange: (status: CampaignFilter) => void;
  onCampaignChange: () => void;
  fixedProject?: { id: string; active: boolean };
}) {
  const columns = fixedProject
    ? "md:grid-cols-[minmax(0,1.6fr)_120px_130px_100px]"
    : "md:grid-cols-[minmax(0,1.6fr)_minmax(120px,1fr)_120px_130px_100px]";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), status });
    if (search) params.set("q", search);
    if (projectId) params.set("projectId", projectId);

    async function loadCampaigns() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/campaigns?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json() as CampaignsResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || "Campaigns could not be loaded.");
        if (!Array.isArray(result.campaigns) || !Number.isInteger(result.totalPages)) {
          throw new Error("Campaign response was invalid.");
        }
        setData(result);
        if (page > result.totalPages) setPage(result.totalPages);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Campaigns could not be loaded.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCampaigns();
    return () => controller.abort();
  }, [enabled, page, projectId, reloadKey, search, status]);

  async function updateCampaign(campaign: Campaign, update: { title?: string; status?: "archived" | "restored" }) {
    setPendingId(campaign.id);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${campaign.projectId}/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Campaign could not be updated.");
      setReloadKey((value) => value + 1);
      onCampaignChange();
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : "Campaign could not be updated.");
    } finally {
      setPendingId("");
    }
  }

  function archiveCampaign(campaign: Campaign) {
    if (window.confirm("Archive this campaign? You can restore it later.")) {
      void updateCampaign(campaign, { status: "archived" });
    }
  }

  function renameCampaign(campaign: Campaign) {
    const title = window.prompt("Campaign name", campaign.title);
    if (title?.trim()) void updateCampaign(campaign, { title: title.trim() });
  }

  const filtered = Boolean(search || status !== "active" || (!fixedProject && projectId));
  const start = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="pt-5">
      <div className={cn("grid grid-cols-2 gap-3", fixedProject ? "sm:grid-cols-[minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto_auto]")}>
        <label className={cn("relative block", fixedProject ? "col-span-2 sm:col-span-1" : "col-span-2 sm:col-span-1")}>
          <span className="sr-only">{fixedProject ? "Search campaigns" : "Search campaigns and projects"}</span>
          <MagnifyingGlass size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={fixedProject ? "Search campaigns" : "Search campaigns or projects"}
            className="min-h-10 w-full rounded-control border border-line bg-surface-raised py-2 pl-9 pr-3 text-sm placeholder:text-muted"
          />
        </label>
        <label className="sr-only" htmlFor="campaign-filter">Campaign status</label>
        <Select<CampaignFilter>
          id="campaign-filter"
          value={status}
          onValueChange={(value) => { onStatusChange(value); setPage(1); }}
          options={[{ value: "active", label: "Active campaigns" }, { value: "archived", label: "Archived campaigns" }, { value: "all", label: "All campaigns" }]}
          className={cn("w-full sm:w-44", fixedProject && "col-span-2 sm:col-span-1")}
        />
        {!fixedProject && (
          <>
            <label className="sr-only" htmlFor="campaign-project">Project</label>
            <Select
              id="campaign-project"
              value={projectId}
              onValueChange={(value) => { onProjectIdChange(value); setPage(1); }}
              options={[{ value: "", label: "Every project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
              className="w-full sm:w-44"
            />
          </>
        )}
      </div>

      {message && <p role="alert" className="mt-3 rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{message}</p>}
      {error ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-container border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="text-danger">{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button>
        </div>
      ) : loading ? (
        <div className="mt-4 flex min-h-48 items-center justify-center rounded-container border border-line bg-surface-raised">
          <LoadingIndicator label="Loading campaigns" />
        </div>
      ) : data && data.campaigns.length > 0 ? (
        <>
          <div className="mt-4 overflow-hidden rounded-container border border-line bg-surface-raised">
            <div className={cn("hidden gap-4 border-b border-line bg-surface px-4 py-3 text-[10px] font-semibold uppercase text-muted md:grid md:px-5", columns)}>
              <span>Campaign</span>{!fixedProject && <span>Project</span>}<span>Status</span><span>Last updated</span><span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-line">
              {data.campaigns.map((campaign) => (
                <li key={campaign.id} className={cn("grid gap-3 px-4 py-4 transition-colors hover:bg-canvas/60 md:items-center md:gap-4 md:px-5", columns)}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
                      <GlobeSimple size={17} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/studio?projectId=${encodeURIComponent(campaign.projectId)}&campaignId=${encodeURIComponent(campaign.id)}`}
                        className="block truncate text-sm font-semibold hover:text-accent"
                        title={campaign.title || "Untitled campaign"}
                      >
                        {campaign.title || "Untitled campaign"}
                      </Link>
                      <p className="mt-1 truncate text-xs text-muted">{kindLabel(campaign.kind)}</p>
                    </div>
                  </div>
                  {!fixedProject && (
                    <div className="min-w-0 md:block">
                      <span className="text-[10px] uppercase text-muted md:hidden">Project · </span>
                      <span className="truncate text-xs font-medium">{campaign.projectName}</span>
                      {campaign.projectStatus === "archived" && <span className="ml-2 text-[10px] text-muted">Archived project</span>}
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] uppercase text-muted md:hidden">Status · </span>
                    <Badge className={statusTone(campaign.status)}>{campaign.status}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    <span className="md:hidden">Updated · </span>{formatDate(campaign.updatedAt)}
                  </p>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/studio?projectId=${encodeURIComponent(campaign.projectId)}&campaignId=${encodeURIComponent(campaign.id)}`}>
                        Open <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                    {campaign.projectStatus === "active" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" disabled={pendingId === campaign.id} className="flex size-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50" aria-label={`Actions for ${campaign.title || "untitled campaign"}`}>
                            <DotsThree size={20} weight="bold" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={pendingId === campaign.id} onSelect={() => renameCampaign(campaign)}>
                            Rename campaign
                          </DropdownMenuItem>
                          {campaign.status === "archived" ? (
                            <DropdownMenuItem disabled={pendingId === campaign.id} onSelect={() => void updateCampaign(campaign, { status: "restored" })}>
                              Restore campaign
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled={pendingId === campaign.id} className="text-danger" onSelect={() => archiveCampaign(campaign)}>
                              Archive campaign
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite">Showing {start}–{end} of {data.total} campaigns</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                <CaretLeft size={15} aria-hidden="true" /> Previous
              </Button>
              <span className="min-w-20 text-center">Page {page} of {data.totalPages}</span>
              <Button type="button" size="sm" variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>
                Next <CaretRight size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-container border border-dashed border-line bg-surface-raised p-6">
          <p className="text-sm font-semibold">
            {filtered ? "No campaigns match these filters" : fixedProject ? "Start this project's first campaign" : "No campaigns yet"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {filtered
              ? "Adjust the search or filters to find campaigns."
              : fixedProject
                ? "Tell us what's new and we'll write the posts and a matching visual."
                : "Start a project launch to create its first campaign."}
          </p>
          {!filtered && (!fixedProject || fixedProject.active) && (
            <Button asChild size="sm" className="mt-4">
              {fixedProject ? (
                <Link href={`/studio?projectId=${encodeURIComponent(fixedProject.id)}&newCampaign=1`}><Plus size={16} weight="bold" /> New campaign</Link>
              ) : (
                <Link href="/studio?new=1"><Plus size={16} weight="bold" /> Start a launch</Link>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
