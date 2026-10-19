import { z } from "zod";

const ONBOARDING_ROLES = [
  "founder",
  "marketing",
  "product",
  "other",
] as const;

const ONBOARDING_GOALS = [
  "new_product",
  "product_update",
  "waitlist",
  "milestone",
] as const;

const ONBOARDING_CHANNELS = [
  "linkedin",
  "x",
  "product_hunt",
  "reddit",
  "hacker_news",
  "instagram",
  "threads",
  "facebook",
  "email",
] as const;

const optionalHttpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .nullable()
  .refine((value) => {
    if (value === null) return true;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a valid website URL.");

export const onboardingSubmissionSchema = z
  .object({
    organizationName: z.string().trim().min(1).max(120),
    websiteUrl: optionalHttpUrlSchema,
    role: z.enum(ONBOARDING_ROLES),
    launchGoal: z.enum(ONBOARDING_GOALS),
    channels: z.array(z.enum(ONBOARDING_CHANNELS)).max(ONBOARDING_CHANNELS.length),
  })
  .strict();

export type OnboardingSubmission = z.infer<typeof onboardingSubmissionSchema>;
