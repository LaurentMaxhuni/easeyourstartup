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
    id: "creative",
    label: "Your posts",
    description: "Review, copy, and download",
  },
] as const;

export type StudioStageId = (typeof STUDIO_STAGES)[number]["id"];

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
