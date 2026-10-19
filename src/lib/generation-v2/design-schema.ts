import { z } from "zod";
import { creativeLayoutSchema } from "@/lib/contracts";

const campaignDesignComponentKindSchema = z.enum([
  "cover",
  "problem",
  "solution",
  "feature",
  "screenshot",
  "stat",
  "quote",
  "comparison",
  "cta",
]);

export const campaignDesignPlanSchema = z
  .object({
    version: z.literal("1"),
    brandAdaptation: z.object({
      tone: z.enum([
        "editorial",
        "confident",
        "warm",
        "minimal",
        "playful",
        "technical",
      ]),
      rationale: z.string().min(1).max(240),
      theme: z.object({
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        headingFontFamily: z.string().min(1).max(100),
        bodyFontFamily: z.string().min(1).max(100),
        density: z.enum(["compact", "comfortable", "airy"]),
        usesGradient: z.boolean(),
      }),
    }),
    components: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
          order: z.number().int().min(0).max(8),
          kind: campaignDesignComponentKindSchema,
          layoutVariant: creativeLayoutSchema,
          eyebrow: z.string().max(80).default(""),
          headline: z.string().min(1).max(180),
          supportingCopy: z.string().max(320).default(""),
          body: z.string().max(520).default(""),
          cta: z.string().max(80).default(""),
          footer: z.string().max(120).default(""),
          alignment: z.enum(["left", "center", "right"]),
          emphasis: z.enum([
            "eyebrow",
            "headline",
            "supportingCopy",
            "metric",
            "quote",
            "cta",
          ]),
          supportingClaimIds: z.array(z.string().min(1).max(80)).max(8).default([]),
          screenshotRef: z
            .string()
            .regex(/^product-screenshot-(?:[1-9]|1[0-6])$/)
            .nullable()
            .default(null),
        }),
      )
      .min(1)
      .max(9),
  })
  .superRefine((plan, context) => {
    const ids = new Set<string>();
    const orders = new Set<number>();

    plan.components.forEach((component, index) => {
      if (ids.has(component.id)) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "id"],
          message: "Component IDs must be unique.",
        });
      }
      ids.add(component.id);

      if (orders.has(component.order)) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "order"],
          message: "Component order values must be unique.",
        });
      }
      orders.add(component.order);

      if (component.kind !== "screenshot" && component.screenshotRef !== null) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "screenshotRef"],
          message: "Only screenshot components may reference a product screenshot.",
        });
      }
    });
  });

export type CampaignDesignPlan = z.infer<typeof campaignDesignPlanSchema>;
export type CampaignDesignComponentKind = z.infer<
  typeof campaignDesignComponentKindSchema
>;
