import type { CampaignKind, Channel } from "@/lib/contracts";

export const CHANNELS: Array<{
  id: Channel;
  name: string;
  note: string;
}> = [
  { id: "x", name: "X", note: "Hook first, compact, conversational" },
  { id: "linkedin", name: "LinkedIn", note: "Scannable story with useful context" },
  { id: "product_hunt", name: "Product Hunt", note: "Maker-led intro and crisp value" },
  { id: "reddit", name: "Reddit", note: "Transparent context, no hard sell" },
  { id: "hacker_news", name: "Hacker News", note: "Direct launch note for builders" },
  { id: "instagram", name: "Instagram", note: "Visual caption with a clear payoff" },
  { id: "threads", name: "Threads", note: "Casual, punchy conversation starter" },
  { id: "facebook", name: "Facebook", note: "Warm explanation and explicit CTA" },
  { id: "email", name: "Email", note: "Subject, preview line, and focused body" },
];

export const CAMPAIGN_KINDS: Array<{
  id: CampaignKind;
  name: string;
}> = [
  { id: "launch", name: "Initial launch" },
  { id: "feature_update", name: "Feature update" },
  { id: "milestone", name: "Milestone" },
  { id: "waitlist", name: "Waitlist" },
  { id: "promotion", name: "Promotion" },
  { id: "custom", name: "Custom announcement" },
];

export const CHANNEL_LABELS = Object.fromEntries(
  CHANNELS.map((channel) => [channel.id, channel.name]),
) as Record<Channel, string>;
