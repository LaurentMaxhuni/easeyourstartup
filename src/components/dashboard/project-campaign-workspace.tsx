"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  DotsThree,
  GlobeSimple,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { cn } from "@/lib/utils";

export type DashboardProject = {
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
          <p className="font-sans text-[10px] uppercase text-accent">Workspace</p>
          <h2 id="workspace-heading" className="mt-2 text-2xl font-semibold">
            {view === "projects" ? "Projects" : "Campaigns"}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            {view === "projects"
              ? "Keep each product and its latest campaign work together."
              : "Find any campaign and see which project it belongs to."}
          </p>
        </div>

        <div className="inline-flex w-fit rounded-control border border-line bg-surface p-1" role="group" aria-label="Workspace view">
          <button
            type="button"
            aria-pressed={view === "projects"}
            onClick={() => setView("projects")}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition-colors",
              view === "projects" ? "bg-surface-raised text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            Projects <span className="text-xs text-muted">{activeProjectCount}</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "campaigns"}
            onClick={() => setView("campaigns")}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded px-3 text-sm font-semibold transition-colors",
              view === "campaigns" ? "bg-surface-raised text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            Campaigns <span className="text-xs text-muted">{activeCampaignCount}</span>
          </button>
        </div>
      </div>

      <div hidden={view !== "projects"}>
        <ProjectsList
          projects={projects}
          onProjectUpdate={onCampaignChange}
          onProjectDelete={onCampaignChange}
          onViewCampaigns={(projectId, status = "active") => {
            setCampaignProjectId(projectId);
            setCampaignStatus(status);
            setView("campaigns");
          }}
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
  onViewCampaigns,
}: {
  projects: DashboardProject[];
  onProjectUpdate: (projectId: string, update: Partial<DashboardProject>) => void;
  onProjectDelete: (projectId: string) => void;
  onViewCampaigns: (projectId: string, status?: CampaignFilter) => void;
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
      <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
        <label className="relative block">
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
        <select
          id="project-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as ProjectFilter)}
          className="min-h-10 rounded-control border border-line bg-surface-raised px-3 text-sm"
        >
          <option value="active">Active projects</option>
          <option value="archived">Archived projects</option>
          <option value="all">All projects</option>
        </select>
        <label className="sr-only" htmlFor="project-sort">Sort projects</label>
        <select
          id="project-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as "updated" | "name")}
          className="min-h-10 rounded-control border border-line bg-surface-raised px-3 text-sm"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {visibleProjects.length > 0 ? (
        <div className="mt-4 space-y-3">
          {visibleProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onProjectUpdate={onProjectUpdate}
              onProjectDelete={onProjectDelete}
              onViewCampaigns={onViewCampaigns}
            />
          ))}
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

function ProjectRow({
  project,
  onProjectUpdate,
  onProjectDelete,
  onViewCampaigns,
}: {
  project: DashboardProject;
  onProjectUpdate: (projectId: string, update: Partial<DashboardProject>) => void;
  onProjectDelete: (projectId: string) => void;
  onViewCampaigns: (projectId: string, status?: CampaignFilter) => void;
}) {
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState(project.status);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sourceHost = hostFromUrl(project.publicUrl);
  const recentCampaigns = project.campaigns.filter((campaign) => campaign.status !== "archived").slice(0, 3);
  const hasArchivedCampaigns = project.campaigns.some((campaign) => campaign.status === "archived");

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
      onProjectUpdate(project.id, result.project);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project could not be updated.");
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
    <article className="overflow-hidden rounded-container border border-line bg-surface-raised transition-colors hover:border-accent/40">
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
            <GlobeSimple size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="max-w-full truncate text-base font-semibold" title={name}>{name}</h3>
              <Badge className={status === "active" ? statusTone("active") : ""}>{status}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted" title={project.publicUrl ?? undefined}>{sourceHost}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span><strong className="font-semibold text-ink">{project.campaignCount}</strong> active {project.campaignCount === 1 ? "campaign" : "campaigns"}</span>
              <span><strong className="font-semibold text-ink">{project.sourcePageCount}</strong> source {project.sourcePageCount === 1 ? "page" : "pages"}</span>
              <span>Updated {formatDate(project.updatedAt ?? project.lastScannedAt, "Not yet")}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {status === "active" && (
            <Button asChild size="sm">
              <Link href={`/studio?projectId=${encodeURIComponent(project.id)}&newCampaign=1`}>
                <Plus size={15} weight="bold" /> New campaign
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="secondary">
            <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
              Open project <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="border-t border-line px-4 py-3 sm:px-5">
        {recentCampaigns.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted">Recent campaigns</p>
              <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
                {recentCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/studio?projectId=${encodeURIComponent(project.id)}&campaignId=${encodeURIComponent(campaign.id)}`}
                    className="flex min-w-0 items-center justify-between gap-3 rounded px-1 py-2 text-xs transition-colors hover:bg-canvas"
                  >
                    <span className="truncate font-medium">{campaign.title || "Untitled campaign"}</span>
                    <span className="shrink-0 capitalize text-muted">{campaign.status}</span>
                  </Link>
                ))}
              </div>
            </div>
            {(project.campaignCount > recentCampaigns.length || hasArchivedCampaigns) && (
              <button
                type="button"
                onClick={() => onViewCampaigns(project.id, "all")}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 text-xs font-semibold text-accent"
              >
                View all campaigns <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {project.campaignCount > 0
                ? "No recent active campaigns"
                : hasArchivedCampaigns ? "No active campaigns · archived campaigns available" : "No campaigns yet"}
            </p>
            {project.campaignCount > 0 ? (
              <button type="button" onClick={() => onViewCampaigns(project.id, "active")} className="text-xs font-semibold text-accent">
                View active campaigns
              </button>
            ) : hasArchivedCampaigns ? (
              <button type="button" onClick={() => onViewCampaigns(project.id, "archived")} className="text-xs font-semibold text-accent">
                View archived
              </button>
            ) : null}
          </div>
        )}
      </div>

      <details className="border-t border-line px-4 py-3 sm:px-5">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted hover:text-ink">
          <DotsThree size={18} aria-hidden="true" /> Project settings
        </summary>
        <form className="mt-3 flex max-w-lg gap-2" onSubmit={(event) => { event.preventDefault(); void updateProject({ name }); }}>
          <label className="sr-only" htmlFor={`project-name-${project.id}`}>Project name</label>
          <input
            id={`project-name-${project.id}`}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-control border border-line bg-canvas px-3 py-2 text-xs"
          />
          <Button size="sm" variant="secondary" disabled={busy}>Save</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <button type="button" disabled={busy} className="text-xs text-muted hover:text-ink disabled:opacity-50" onClick={() => {
            if (status === "archived") void updateProject({ status: "active" });
            else if (window.confirm("Archive this project? Its data will remain saved.")) void updateProject({ status: "archived" });
          }}>{status === "archived" ? "Restore project" : "Archive project"}</button>
          <button type="button" disabled={busy} className="text-xs text-danger disabled:opacity-50" onClick={() => void deleteProject()}>
            Delete project and its data
          </button>
        </div>
        {message && <p role="alert" className="mt-2 text-xs text-danger">{message}</p>}
      </details>
    </article>
  );
}

function CampaignsList({
  projects,
  enabled,
  projectId,
  onProjectIdChange,
  status,
  onStatusChange,
  onCampaignChange,
}: {
  projects: DashboardProject[];
  enabled: boolean;
  projectId: string;
  onProjectIdChange: (projectId: string) => void;
  status: CampaignFilter;
  onStatusChange: (status: CampaignFilter) => void;
  onCampaignChange: () => void;
}) {
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

  const start = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div className="pt-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search campaigns and projects</span>
          <MagnifyingGlass size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campaigns or projects"
            className="min-h-10 w-full rounded-control border border-line bg-surface-raised py-2 pl-9 pr-3 text-sm placeholder:text-muted"
          />
        </label>
        <label className="sr-only" htmlFor="campaign-filter">Campaign status</label>
        <select
          id="campaign-filter"
          value={status}
          onChange={(event) => { onStatusChange(event.target.value as CampaignFilter); setPage(1); }}
          className="min-h-10 rounded-control border border-line bg-surface-raised px-3 text-sm"
        >
          <option value="active">Active campaigns</option>
          <option value="archived">Archived campaigns</option>
          <option value="all">All campaigns</option>
        </select>
        <label className="sr-only" htmlFor="campaign-project">Project</label>
        <select
          id="campaign-project"
          value={projectId}
          onChange={(event) => { onProjectIdChange(event.target.value); setPage(1); }}
          className="min-h-10 rounded-control border border-line bg-surface-raised px-3 text-sm"
        >
          <option value="">Every project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
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
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(120px,1fr)_120px_130px_100px] gap-4 border-b border-line bg-surface px-4 py-3 text-[10px] font-semibold uppercase text-muted md:grid md:px-5">
              <span>Campaign</span><span>Project</span><span>Status</span><span>Last updated</span><span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-line">
              {data.campaigns.map((campaign) => (
                <li key={campaign.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-canvas/60 md:grid-cols-[minmax(0,1.6fr)_minmax(120px,1fr)_120px_130px_100px] md:items-center md:gap-4 md:px-5">
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
                  <div className="min-w-0 md:block">
                    <span className="text-[10px] uppercase text-muted md:hidden">Project · </span>
                    <span className="truncate text-xs font-medium">{campaign.projectName}</span>
                    {campaign.projectStatus === "archived" && <span className="ml-2 text-[10px] text-muted">Archived project</span>}
                  </div>
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
                      <details className="relative">
                        <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-control text-muted transition-colors hover:bg-surface hover:text-ink" aria-label={`Actions for ${campaign.title || "untitled campaign"}`}>
                          <DotsThree size={20} weight="bold" aria-hidden="true" />
                        </summary>
                        <div className="absolute right-0 z-10 mt-2 w-44 rounded-control border border-line bg-surface-raised p-2 shadow-lg">
                          <button type="button" disabled={pendingId === campaign.id} className="block min-h-9 w-full rounded px-2 text-left text-xs hover:bg-surface disabled:opacity-50" onClick={() => renameCampaign(campaign)}>
                            Rename campaign
                          </button>
                          {campaign.status === "archived" ? (
                            <button type="button" disabled={pendingId === campaign.id} className="block min-h-9 w-full rounded px-2 text-left text-xs hover:bg-surface disabled:opacity-50" onClick={() => void updateCampaign(campaign, { status: "restored" })}>
                              Restore campaign
                            </button>
                          ) : (
                            <button type="button" disabled={pendingId === campaign.id} className="block min-h-9 w-full rounded px-2 text-left text-xs text-danger hover:bg-surface disabled:opacity-50" onClick={() => archiveCampaign(campaign)}>
                              Archive campaign
                            </button>
                          )}
                        </div>
                      </details>
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
            {search || projectId || status !== "active" ? "No campaigns match these filters" : "No campaigns yet"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {search || projectId || status !== "active"
              ? "Adjust the search or filters to find campaigns."
              : "Start a project launch to create its first campaign."}
          </p>
          {!search && !projectId && status === "active" && (
            <Button asChild size="sm" className="mt-4">
              <Link href="/studio?new=1"><Plus size={16} weight="bold" /> Start a launch</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
