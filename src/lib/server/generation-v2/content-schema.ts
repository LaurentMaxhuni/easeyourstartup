import { z } from "zod";
import { channelOutputSchema, channelSchema } from "@/lib/contracts";

export const platformCopyFieldsSchema = channelOutputSchema.omit({
  channel: true,
  cta: true,
  associatedCreativeIds: true,
  warnings: true,
});

export function platformCopyResponseSchema() {
  return platformCopyFieldsSchema;
}

export const platformCopyFeedbackSchema = z.string().trim().min(1).max(2000);

export const platformCopyChannelSchema = channelSchema;
