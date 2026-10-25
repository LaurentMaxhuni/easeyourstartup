"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowSquareOut, PencilSimple, Plus } from "@phosphor-icons/react";
import type { AccountProfile } from "@/components/account/account-avatar-link";
import { DashboardHeader } from "@/components/dashboard/dashboard-shell";
import { CampaignsList, ProjectCover, ProjectMark } from "@/components/dashboard/project-campaign-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { projectBrandSummary, type ProjectBrandSummary } from "@/lib/project-brand";

type ProjectResponse = {
  project?: { id: string; name: string; publicUrl: string | null; status: "active" | "archived" };
  scan?: { profile?: unknown; pages?: unknown[] } | null;
  campaigns?: unknown[];
  error?: string;
};

type LoadedProject = {
  id: string;
  name: string;
  publicUrl: string | null;
  status: "active" | "archived";
  brand: ProjectBrandSummary | null;
  sourcePageCount: number;
};

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function ProjectDetail({ projectId, profile }: { projectId: string; profile: AccountProfile }) {
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [campaignStatus, setCampaignStatus] = useState<"active" | "archived" | "all">("active");

  useEffect(() => {
    const controller = new AbortController();
    async function loadProject() {
      setError("");
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as ProjectResponse;
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok || !data.project) throw new Error(data.error || "Project could not be loaded.");
        setProject({
          ...data.project,
          brand: projectBrandSummary(data.scan?.profile ?? null),
          sourcePageCount: data.scan?.pages?.length ?? 0,
        });
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Project could not be loaded.");
        }
      }
    }
    void loadProject();
    return () => controller.abort();
  }, [projectId, reloadKey]);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <DashboardHeader profile={profile} />
      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <Link href="/dashboard" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={15} aria-hidden="true" /> All projects
        </Link>

        {notFound ? (
          <section className="mt-6 rounded-container border border-dashed border-line bg-surface-raised p-6">
            <h1 className="text-lg font-semibold">Project not found</h1>
            <p className="mt-1 text-sm text-muted">It may have been deleted, or it belongs to another workspace.</p>
            <Button asChild size="sm" variant="secondary" className="mt-4"><Link href="/dashboard">Back to projects</Link></Button>
          </section>
        ) : error ? (
          <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-container border border-danger/30 bg-danger/5 p-4 text-sm">
            <p className="text-danger">{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button>
          </div>
        ) : !project ? (
          <div className="mt-6 flex min-h-56 items-center justify-center rounded-container border border-line bg-surface-raised">
            <LoadingIndicator label="Loading project" />
          </div>
        ) : (
          <>
            <section className="mt-4 grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-center">
              <div className="overflow-hidden rounded-container border border-line">
                <ProjectCover name={project.name} brand={project.brand} archived={project.status === "archived"} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <ProjectMark name={project.name} brand={project.brand} />
                  <h1 className="min-w-0 truncate text-2xl font-semibold sm:text-3xl" title={project.name}>{project.name}</h1>
                  {project.status === "archived" && <Badge>Archived</Badge>}
                </div>
                {project.brand?.tagline && (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{project.brand.tagline}</p>
                )}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  {project.publicUrl && (
                    <a href={project.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                      {hostFromUrl(project.publicUrl)} <ArrowSquareOut size={12} aria-hidden="true" />
                    </a>
                  )}
                  <span>{project.sourcePageCount} source {project.sourcePageCount === 1 ? "page" : "pages"}</span>
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {project.status === "active" ? (
                    <Button asChild>
                      <Link href={`/studio?projectId=${encodeURIComponent(project.id)}&newCampaign=1`}>
                        <Plus size={16} weight="bold" aria-hidden="true" /> New campaign
                      </Link>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted">Restore this project from its menu on the dashboard to start new campaigns.</p>
                  )}
                  <Button asChild variant="secondary">
                    <Link href={`/studio?projectId=${encodeURIComponent(project.id)}`}>
                      <PencilSimple size={16} aria-hidden="true" /> Edit website details
                    </Link>
                  </Button>
                </div>
              </div>
            </section>

            <section className="mt-10" aria-labelledby="project-campaigns-heading">
              <h2 id="project-campaigns-heading" className="border-b border-line pb-4 text-xl font-semibold">Campaigns</h2>
              <CampaignsList
                projects={[]}
                enabled
                projectId={project.id}
                onProjectIdChange={() => undefined}
                status={campaignStatus}
                onStatusChange={setCampaignStatus}
                onCampaignChange={() => undefined}
                fixedProject={{ id: project.id, active: project.status === "active" }}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
