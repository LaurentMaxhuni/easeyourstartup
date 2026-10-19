import { z } from "zod";
import { channelOutputSchema, channelSchema, type Channel } from "@/lib/contracts";

const platformCopyFieldsSchema = channelOutputSchema.omit({
  channel: true,
  cta: true,
  associatedCreativeIds: true,
  warnings: true,
});

export function platformCopyResponseSchema(channel?: Channel) {
  const limit = channel === "x" ? 280 : channel === "threads" ? 500 : undefined;
  return limit
    ? platformCopyFieldsSchema.extend({ primaryCopy: z.string().trim().min(1).max(limit) })
    : platformCopyFieldsSchema;
}

export const platformCopyFeedbackSchema = z.string().trim().min(1).max(2000);

export const platformCopyChannelSchema = channelSchema;
