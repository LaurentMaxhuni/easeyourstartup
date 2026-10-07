import { describe, expect, it } from "vitest";
import { campaignDraftWithDefaults } from "./campaign-defaults";
import { DEMO_ANGLES, DEMO_BRAND } from "@/lib/demo-data";
import { generateCampaignSchema } from "@/lib/contracts";

const draft = { kind: "launch" as const, goal: "", updateDetails: "Shared project folders are now available.", audience: "", cta: "", launchDate: "", angle: DEMO_ANGLES[0], channels: ["x" as const] };
describe("campaign defaults", () => {
  it("lets a founder generate with just an announcement and platforms", () => {
    const ready = campaignDraftWithDefaults(draft, DEMO_BRAND);
    expect(generateCampaignSchema.safeParse({ ...ready, brand: DEMO_BRAND }).success).toBe(true);
    expect(ready.audience).toBe(DEMO_BRAND.audience);
    expect(ready.cta).toBe(DEMO_BRAND.cta);
    expect(ready.updateDetails).toBe(draft.updateDetails);
  });
  it("preserves the founder’s chosen audience, goal, and next step", () => {
    const chosen = { ...draft, audience: "Existing customers", goal: "Invite customers to try the shared folders", cta: "Open your account" };
    expect(campaignDraftWithDefaults(chosen, DEMO_BRAND)).toEqual(chosen);
  });
});
