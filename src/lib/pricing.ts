export type BillingInterval = "monthly" | "annual";

// Annual totals are rounded once to cents, after the 20% discount.
export const PAID_PRICES = {
  pro_lite: { monthly: 13.99, annual: 134.30 },
  pro: { monthly: 29, annual: 278.40 },
  founding: { monthly: 19, annual: 182.40 },
} as const;
