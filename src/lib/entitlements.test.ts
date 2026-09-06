import { describe, expect, it } from "vitest";
import {
  canExportLaunchKit,
  canConsumeCampaign,
  canReserveCampaign,
  getRemainingCampaigns,
  PLAN_LIMITS,
  shouldCountUsage,
} from "@/lib/entitlements";

describe("plan entitlements", () => {
  it("keeps the published Pro limits stable", () => {
    expect(PLAN_LIMITS.pro.activeProjects).toBe(3);
    expect(PLAN_LIMITS.pro.campaignsPerPeriod).toBe(8);
    expect(PLAN_LIMITS.pro.regenerationsPerChannel).toBe(5);
  });

  it("allows only successful jobs to consume usage", () => {
    expect(shouldCountUsage("completed")).toBe(true);
    expect(shouldCountUsage("failed")).toBe(false);
    expect(shouldCountUsage("generating")).toBe(false);
  });

  it("blocks a ninth Pro campaign in the same period", () => {
    expect(canConsumeCampaign("pro", 7)).toBe(true);
    expect(canConsumeCampaign("pro", 8)).toBe(false);
  });

  it("keeps full launch-kit downloads behind Pro", () => {
    expect(canExportLaunchKit("free")).toBe(false);
    expect(canExportLaunchKit("pro")).toBe(true);
  });

  it("counts in-flight campaigns against a plan's available slots", () => {
    expect(canReserveCampaign("pro", 7, 0)).toBe(true);
    expect(canReserveCampaign("pro", 7, 1)).toBe(false);
    expect(canReserveCampaign("free", 0, 1)).toBe(false);
  });

  it("shows completed and reserved campaigns in the remaining allowance", () => {
    expect(getRemainingCampaigns("pro", 2, 1)).toBe(5);
    expect(getRemainingCampaigns("free", 0, 1)).toBe(0);
    expect(getRemainingCampaigns("pro", 99, 0)).toBe(0);
  });
});
