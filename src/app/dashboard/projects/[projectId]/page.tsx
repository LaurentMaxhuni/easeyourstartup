import type { Metadata } from "next";
import { AuthenticationUnavailable } from "@/components/auth/authentication-unavailable";
import { ProjectDetail } from "@/components/dashboard/project-detail";
import { requirePageAuthentication } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Project",
  description: "See a project's campaigns and start a new one.",
};

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const path = `/dashboard/projects/${encodeURIComponent(projectId)}`;
  const user = await requirePageAuthentication(path);
  if ("status" in user) {
    return <AuthenticationUnavailable retryHref={path} />;
  }

  return (
    <ProjectDetail
      projectId={projectId}
      profile={{
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
      }}
    />
  );
}
