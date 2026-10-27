export const STUDIO_STAGES = [
  {
    id: "scan",
    label: "Website",
    description: "Add your website",
  },
  {
    id: "brand",
    label: "Your product",
    description: "Review what we found",
  },
  {
    id: "campaign",
    label: "Announcement",
    description: "Tell us what’s new",
  },
  {
    id: "concepts",
    label: "Concepts",
    description: "Choose a post direction",
  },
  {
    id: "creative",
    label: "Your posts",
    description: "Review, copy, and download",
  },
] as const;

export type StudioStageId = (typeof STUDIO_STAGES)[number]["id"];

export function hasPendingCampaignJob(jobType: string | null, jobId: string | null) {
  return jobType === "generate" && jobId !== null;
}

export function shouldResumeCampaignJob(resumePendingJob: boolean, jobType: string | null, jobId: string | null) {
  return resumePendingJob && hasPendingCampaignJob(jobType, jobId);
}

export function getStudioProgress(current: StudioStageId) {
  const currentIndex = STUDIO_STAGES.findIndex(
    (stage) => stage.id === current,
  );
  const total = STUDIO_STAGES.length;
  return {
    current: currentIndex + 1,
    total,
    percent: Math.round(((currentIndex + 1) / total) * 100),
  };
}
