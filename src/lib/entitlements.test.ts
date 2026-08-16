import { describe, expect, it } from "vitest";
import {
  canConsumeCampaign,
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
});
