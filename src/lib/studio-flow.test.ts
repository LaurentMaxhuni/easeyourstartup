import { describe, expect, it } from "vitest";
import {
  getStudioProgress,
  hasPendingCampaignJob,
  shouldResumeCampaignJob,
  STUDIO_STAGES,
} from "@/lib/studio-flow";

describe("studio flow", () => {
  it("uses plain-language stages and reports progress", () => {
    expect(STUDIO_STAGES.map((stage) => stage.label)).toEqual([
      "Website",
      "Your product",
      "Announcement",
      "Concepts",
      "Your posts",
    ]);
    expect(getStudioProgress("campaign")).toEqual({
      current: 3,
      total: 5,
      percent: 60,
    });
    expect(getStudioProgress("concepts")).toEqual({ current: 4, total: 5, percent: 80 });
  });

  it("routes a pending campaign job to resume instead of queuing concepts again", () => {
    expect(hasPendingCampaignJob("generate", "job-1")).toBe(true);
    expect(hasPendingCampaignJob("scan", "job-1")).toBe(false);
    expect(shouldResumeCampaignJob(true, "generate", "job-1")).toBe(true);
    expect(shouldResumeCampaignJob(true, "scan", "job-1")).toBe(false);
    expect(shouldResumeCampaignJob(true, "generate", null)).toBe(false);
    expect(shouldResumeCampaignJob(false, "generate", "job-1")).toBe(false);
  });
});
