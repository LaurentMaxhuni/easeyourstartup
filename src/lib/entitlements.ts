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

export function canReserveCampaign(
  plan: Plan,
  successfullyCompletedCampaigns: number,
  reservedCampaigns: number,
) {
  return (
    successfullyCompletedCampaigns + reservedCampaigns <
    PLAN_LIMITS[plan].campaignsPerPeriod
  );
}

export function getRemainingCampaigns(
  plan: Plan,
  successfullyCompletedCampaigns: number,
  reservedCampaigns = 0,
) {
  return Math.max(
    0,
    PLAN_LIMITS[plan].campaignsPerPeriod -
      Math.max(0, successfullyCompletedCampaigns) -
      Math.max(0, reservedCampaigns),
  );
}

export function canExportLaunchKit(plan: Plan) {
  return PLAN_LIMITS[plan].highResolutionExports;
}

export function shouldCountUsage(jobStatus: string) {
  return jobStatus === "completed";
}
