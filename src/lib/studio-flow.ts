export const STUDIO_STAGES = [
  {
    id: "scan",
    label: "Source",
    description: "Scan your public site",
  },
  {
    id: "brand",
    label: "Facts",
    description: "Automatic source curation",
  },
  {
    id: "campaign",
    label: "Brief",
    description: "Describe the launch",
  },
  {
    id: "creative",
    label: "Posts",
    description: "Edit and export",
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
