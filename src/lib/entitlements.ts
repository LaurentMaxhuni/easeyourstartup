export const PLAN_LIMITS = {
  free: {
    activeProjects: 1,
    campaignsPerPeriod: 1,
    regenerationsPerChannel: 0,
    highResolutionExports: false,
    supporterRooms: false,
  },
  pro: {
    activeProjects: 3,
    campaignsPerPeriod: 8,
    regenerationsPerChannel: 5,
    highResolutionExports: true,
    supporterRooms: true,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function canConsumeCampaign(
  plan: Plan,
  successfullyCompletedCampaigns: number,
) {
  return successfullyCompletedCampaigns <
    PLAN_LIMITS[plan].campaignsPerPeriod;
}

export function shouldCountUsage(jobStatus: string) {
  return jobStatus === "completed";
}
