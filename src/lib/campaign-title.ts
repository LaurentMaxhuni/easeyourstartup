export const CAMPAIGN_TITLE_MAX_LENGTH = 70;

// A short, readable campaign name from longer text: the first sentence,
// cut at a word boundary.
export function shortCampaignTitle(text: string, maxLength = CAMPAIGN_TITLE_MAX_LENGTH) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  if (sentence.length <= maxLength) return sentence.replace(/[.!?]+$/, "") || "Untitled campaign";
  const cut = sentence.slice(0, maxLength + 1);
  const space = cut.lastIndexOf(" ");
  const words = space > maxLength * 0.5 ? cut.slice(0, space) : sentence.slice(0, maxLength);
  return `${words.replace(/[\s,;:–—-]+$/, "")}…`;
}

// Titles the app wrote on its own, which may be replaced; anything else was
// typed by the person and is kept. The second form is the pre-short-title one.
export function automaticCampaignTitles(updateDetails: string) {
  return [shortCampaignTitle(updateDetails), updateDetails.slice(0, 180)];
}
