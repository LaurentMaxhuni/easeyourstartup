import type { BillingInterval } from "@/lib/pricing";

export function getUsageWindow(
  interval: BillingInterval | "free",
  periodStart: unknown,
  periodEnd: unknown,
  now = new Date(),
) {
  const calendarStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const calendarEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const dateKey = (value: unknown, fallback: Date) => {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : fallback;
    return (Number.isNaN(date.getTime()) ? fallback : date).toISOString().slice(0, 10);
  };
  // Annual billing never turns a monthly campaign allowance into a yearly one.
  return interval === "monthly"
    ? { start: dateKey(periodStart, calendarStart), end: dateKey(periodEnd, calendarEnd) }
    : { start: dateKey(calendarStart, calendarStart), end: dateKey(calendarEnd, calendarEnd) };
}
