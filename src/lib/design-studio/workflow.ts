import { z } from "zod";
import { brandKitSchema, designAssetSchema, designDocumentSchema } from "./document";

export const generationInputSchema = z.object({
  action: z.literal("generate"), prompt: z.string().trim().min(8).max(6000),
  brand: brandKitSchema, assets: z.array(designAssetSchema).max(12).default([]),
  width: z.number().int().min(320).max(4096).default(1080), height: z.number().int().min(320).max(4096).default(1350),
  variants: z.number().int().min(1).max(3).default(1), slides: z.number().int().min(1).max(9).default(1),
  revisionLimit: z.number().int().min(0).max(3).default(3), tokenBudget: z.number().int().min(1000).max(200000).default(60000),
  preferredProvider: z.string().max(100).optional(),
});
export const editInputSchema = z.object({
  action: z.literal("edit"), prompt: z.string().trim().min(3).max(4000), document: designDocumentSchema,
  history: z.array(z.string().max(1000)).max(12).default([]), preferredProvider: z.string().max(100).optional(),
  tokenBudget: z.number().int().min(1000).max(200000).default(30000),
});
export const designJobInputSchema = z.discriminatedUnion("action", [generationInputSchema, editInputSchema]);
export type DesignJobInput = z.infer<typeof designJobInputSchema>;
export function alternativeLayoutCount(prompt: string): number | null {
  if (!/\b(?:generate|create|show|give|make)\b[\s\S]*\b(?:alternative|different|new)\s+(?:creative\s+)?(?:layouts?|directions?|variants?)\b/i.test(prompt)) return null;
  return /\b(?:two|2)\b/i.test(prompt) ? 2 : /\b(?:one|1)\b/i.test(prompt) ? 1 : 3;
}
export const DESIGN_STAGES = ["Interpreting brief", "Developing art direction", "Planning layout", "Building composition", "Rendering preview", "Evaluating design", "Refining composition", "Ready to edit/export"] as const;
export type DesignStage = typeof DESIGN_STAGES[number];
