import { describe, expect, it } from "vitest";
import { getUsageWindow } from "@/lib/usage-window";

describe("monthly campaign usage windows", () => {
  it.each([
    ["2028-02-29T23:59:59.999Z", "2028-02-01", "2028-03-01"],
    ["2027-02-28T23:59:59.999Z", "2027-02-01", "2027-03-01"],
    ["2026-12-31T23:59:59.999Z", "2026-12-01", "2027-01-01"],
    ["2027-01-01T00:00:00.000Z", "2027-01-01", "2027-02-01"],
    ["2026-04-30T23:59:59.999Z", "2026-04-01", "2026-05-01"],
  ])("annual allowances use UTC calendar months at %s", (now, start, end) => {
    expect(getUsageWindow("annual", "2026-01-31", "2027-01-31", new Date(now)))
      .toEqual({ start, end });
  });

  it("resets annual usage at midnight UTC independently of local offsets", () => {
    expect(getUsageWindow("annual", "2026-01-31", "2027-01-31", new Date("2026-03-01T01:00:00+01:00")))
      .toEqual({ start: "2026-03-01", end: "2026-04-01" });
  });

  it("retains monthly Paddle boundaries including a short February", () => {
    expect(getUsageWindow("monthly", new Date("2028-01-31T15:00:00Z"), "2028-02-29T15:00:00Z", new Date("2028-02-10")))
      .toEqual({ start: "2028-01-31", end: "2028-02-29" });
  });

  it("falls back to a monthly window for missing or invalid monthly dates", () => {
    expect(getUsageWindow("monthly", "invalid", null, new Date("2028-02-10")))
      .toEqual({ start: "2028-02-01", end: "2028-03-01" });
  });

  it("keeps free plans on UTC calendar months", () => {
    expect(getUsageWindow("free", "2026-10-05", "2026-11-05", new Date("2026-10-10")))
      .toEqual({ start: "2026-10-01", end: "2026-11-01" });
  });
});
