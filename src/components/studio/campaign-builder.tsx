"use client";

import { Sparkle, SpinnerGap } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudioActionBar } from "@/components/studio/studio-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_KINDS, CHANNELS } from "@/lib/channels";
import type { BrandProfile, CampaignKind, Channel, NarrativeAngle, StudioDraft } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type CampaignDraft = StudioDraft;

type Suggestion = { updateDetails: string | null; channels: Channel[] };

// Wait for typing to pause before asking which platforms fit the announcement.
const CHANNEL_SUGGESTION_DELAY_MS = 1_200;
const MIN_DETAILS_FOR_CHANNEL_SUGGESTION = 20;

function suggestionBrand(brand: BrandProfile) {
  return {
    projectName: brand.projectName,
    tagline: brand.tagline,
    audience: brand.audience,
    cta: brand.cta,
    claims: brand.claims.filter((claim) => claim.approvalState !== "rejected").slice(0, 20).map((claim) => claim.text),
  };
}

export function CampaignBuilder({ draft, brand, angles, status, error, resumePendingJob, isAuthenticated, onChange, onBack, onGenerate }: {
  draft: CampaignDraft;
  brand: BrandProfile | null;
  angles: NarrativeAngle[];
  status: "idle" | "loading" | "error";
  error: string;
  resumePendingJob: boolean;
  isAuthenticated: boolean;
  onChange: (draft: CampaignDraft) => void;
  onBack: () => void;
  onGenerate: () => Promise<void>;
}) {
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [aiWroteDetails, setAiWroteDetails] = useState(false);
  const [suggestedChannels, setSuggestedChannels] = useState<Channel[]>([]);
  const [suggestingChannels, setSuggestingChannels] = useState(false);
  // A returning announcement keeps the platforms already chosen for it.
  const [channelsChosenByUser, setChannelsChosenByUser] = useState(() => draft.updateDetails.trim().length > 0);
  const lastChannelSuggestionKey = useRef("");
  const autoDraftStarted = useRef(false);
  const canSuggest = isAuthenticated && brand !== null && !resumePendingJob && status !== "loading";

  const requestSuggestion = useCallback(async (mode: "draft" | "channels", signal?: AbortSignal) => {
    if (!brand) return null;
    const current = latestDraft.current;
    const response = await fetch("/api/studio/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, kind: current.kind, updateDetails: current.updateDetails, brand: suggestionBrand(brand) }),
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as Partial<Suggestion> & { error?: string };
    if (!response.ok) throw new Error(data.error || "We couldn't write a draft right now. Write it yourself or try again.");
    return { updateDetails: data.updateDetails ?? null, channels: data.channels ?? [] } satisfies Suggestion;
  }, [brand]);

  const writeDraft = useCallback(async ({ onlyIfEmpty }: { onlyIfEmpty: boolean }) => {
    setDrafting(true);
    setDraftError("");
    try {
      const suggestion = await requestSuggestion("draft");
      if (!suggestion?.updateDetails) return;
      // Never replace words the person typed while the draft was being written.
      if (onlyIfEmpty && latestDraft.current.updateDetails.trim()) return;
      const next = { ...latestDraft.current, updateDetails: suggestion.updateDetails };
      if (!channelsChosenByUser && suggestion.channels.length > 0) {
        next.channels = suggestion.channels;
        setSuggestedChannels(suggestion.channels);
        lastChannelSuggestionKey.current = `${next.kind}:${next.updateDetails.trim()}`;
      }
      latestDraft.current = next;
      onChange(next);
      setAiWroteDetails(true);
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : "We couldn't write a draft right now.");
    } finally {
      setDrafting(false);
    }
  }, [channelsChosenByUser, onChange, requestSuggestion]);

  // Fill an empty announcement from the website as soon as the step opens.
  useEffect(() => {
    if (autoDraftStarted.current || !canSuggest || draft.updateDetails.trim()) return;
    autoDraftStarted.current = true;
    void writeDraft({ onlyIfEmpty: true });
  }, [canSuggest, draft.updateDetails, writeDraft]);

  // Re-pick platforms when the announcement changes, until the person chooses their own.
  useEffect(() => {
    if (!canSuggest || channelsChosenByUser || drafting) return;
    const details = draft.updateDetails.trim();
    if (details.length < MIN_DETAILS_FOR_CHANNEL_SUGGESTION) return;
    const key = `${draft.kind}:${details}`;
    if (key === lastChannelSuggestionKey.current) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSuggestingChannels(true);
      void requestSuggestion("channels", controller.signal)
        .then((suggestion) => {
          if (!suggestion || controller.signal.aborted) return;
          lastChannelSuggestionKey.current = key;
          if (suggestion.channels.length === 0) return;
          setSuggestedChannels(suggestion.channels);
          onChange({ ...latestDraft.current, channels: suggestion.channels });
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setSuggestingChannels(false);
        });
    }, CHANNEL_SUGGESTION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setSuggestingChannels(false);
    };
  }, [canSuggest, channelsChosenByUser, draft.kind, draft.updateDetails, drafting, onChange, requestSuggestion]);

  function toggleChannel(channel: Channel) {
    setChannelsChosenByUser(true);
    onChange({ ...draft, channels: draft.channels.includes(channel)
      ? draft.channels.filter((value) => value !== channel) : [...draft.channels, channel] });
  }

  function suggestChannelsAgain() {
    lastChannelSuggestionKey.current = "";
    setChannelsChosenByUser(false);
  }

  const hasDetails = draft.updateDetails.trim().length > 0;
  const showingSuggestions = !channelsChosenByUser && suggestedChannels.length > 0;

  return (
    <form onSubmit={(event) => { event.preventDefault(); void onGenerate(); }}
      aria-busy={status === "loading"} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Create your posts</p>
      <h1 className="mt-3 text-balance text-3xl font-semibold sm:text-4xl">What would you like to share?</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Tell us what’s new in your own words. We’ll use your website to write the posts and make a matching visual.</p>

      <fieldset disabled={status === "loading" || resumePendingJob} className="mt-8 space-y-7">
        <label className="block">
          <span className="text-sm font-semibold">What are you announcing?</span>
          <Select<CampaignKind> value={draft.kind} onValueChange={(kind) => onChange({ ...draft, kind })}
            options={CAMPAIGN_KINDS.map((kind) => ({ value: kind.id, label: kind.name }))}
            aria-label="What are you announcing?" disabled={status === "loading" || resumePendingJob} className="mt-2" />
        </label>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="announcement-details" className="text-sm font-semibold">What should people know?</label>
            {isAuthenticated && brand && (
              <Button type="button" variant="ghost" size="sm" disabled={drafting || !canSuggest}
                onClick={() => void writeDraft({ onlyIfEmpty: false })}>
                {drafting
                  ? <SpinnerGap size={14} className="animate-spin" aria-hidden />
                  : <Sparkle size={14} weight="fill" className="text-accent" aria-hidden />}
                {drafting ? "Writing…" : hasDetails ? "Rewrite with AI" : "Write with AI"}
              </Button>
            )}
          </div>
          <Textarea id="announcement-details" className="mt-2 min-h-36" value={draft.updateDetails} required minLength={8} maxLength={2000}
            readOnly={drafting} aria-busy={drafting} aria-describedby="announcement-help"
            onChange={(event) => { setAiWroteDetails(false); onChange({ ...draft, updateDetails: event.target.value }); }}
            placeholder={drafting ? "Writing a draft from your website…" : "We added shared project folders. Now your team can keep its work in one place. It’s available today."} />
          <span id="announcement-help" className="mt-2 block text-xs leading-5 text-muted">
            {aiWroteDetails
              ? "AI wrote this from your website. Edit it freely, and check that every detail is true before you continue."
              : "A few sentences are enough: what’s new, who it helps, and when it’s available. Include only details that are true."}
          </span>
          {draftError && <p role="status" className="mt-2 text-xs text-danger">{draftError}</p>}
        </div>

        <section aria-labelledby="channels-title">
          <h2 id="channels-title" className="text-sm font-semibold">Where will you share it?</h2>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {suggestingChannels && (
              <span className="mr-1 inline-flex items-center gap-1 font-semibold text-accent">
                <SpinnerGap size={12} className="animate-spin" aria-hidden />Picking platforms for this announcement…
              </span>
            )}
            {showingSuggestions
              ? "We picked these for this announcement. Change them anytime. You’ll get a separate post for each."
              : "Choose the places you use. You’ll get a separate post for each."}
            {channelsChosenByUser && canSuggest && hasDetails && (
              <> <button type="button" onClick={suggestChannelsAgain}
                className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline">Suggest for me</button></>
            )}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {CHANNELS.map((channel) => {
              const selected = draft.channels.includes(channel.id);
              return <label key={channel.id} className={cn("flex cursor-pointer items-center gap-3 rounded-control border p-3 text-sm", selected ? "border-accent bg-accent/10" : "border-line bg-surface-raised")}>
                <input type="checkbox" checked={selected} onChange={() => toggleChannel(channel.id)} className="size-4 accent-[var(--accent)]" />
                {channel.name}
                {showingSuggestions && suggestedChannels.includes(channel.id) && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-accent">Suggested</span>
                )}
              </label>;
            })}
          </div>
          {draft.channels.length === 0 && <p role="status" className="mt-2 text-xs text-danger">Choose at least one place to share your post.</p>}
        </section>

        <details className="rounded-container border border-line bg-surface-raised p-5">
          <summary className="cursor-pointer text-sm font-semibold">Adjust audience, goal, or style <span className="font-normal text-muted">(optional)</span></summary>
          <p className="mt-3 text-xs leading-5 text-muted">We filled these from your website. Change them if this announcement needs something different.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="text-xs font-semibold">What do you want this post to achieve?</span>
              <Input className="mt-2" value={draft.goal} maxLength={500} onChange={(event) => onChange({ ...draft, goal: event.target.value })} />
            </label>
            <label className="block"><span className="text-xs font-semibold">Who is this for?</span>
              <Input className="mt-2" value={draft.audience} maxLength={400} onChange={(event) => onChange({ ...draft, audience: event.target.value })} />
            </label>
            <label className="block"><span className="text-xs font-semibold">What should readers do next?</span>
              <Input className="mt-2" value={draft.cta} maxLength={240} onChange={(event) => onChange({ ...draft, cta: event.target.value })} />
            </label>
            <label className="block"><span className="text-xs font-semibold">Announcement date (optional)</span>
              <Input className="mt-2" type="date" value={draft.launchDate} onChange={(event) => onChange({ ...draft, launchDate: event.target.value })} />
            </label>
            {angles.length > 1 && <label className="block"><span className="text-xs font-semibold">Story style</span>
              <Select value={draft.angle.id} onValueChange={(value) => { const angle = angles.find((item) => item.id === value); if (angle) onChange({ ...draft, angle }); }}
                options={angles.map((angle) => ({ value: angle.id, label: angle.title }))}
                aria-label="Story style" disabled={status === "loading" || resumePendingJob} className="mt-2" />
            </label>}
          </div>
        </details>
      </fieldset>

      {error && <div role="alert" className="mt-6 rounded-control border border-danger/30 bg-surface p-4 text-sm text-danger">{error}</div>}
      <StudioActionBar backLabel="Review website details" onBack={onBack}
        nextLabel={isAuthenticated ? resumePendingJob ? "Check concepts" : status === "error" ? "Try again" : "Choose a post concept" : "Sign in to choose a concept"}
        nextType="submit" loading={status === "loading"}
        helper={resumePendingJob ? "Your request is saved. Check its progress without starting again." : "Preview three branded designs right away. Custom AI designs are optional. Nothing is published automatically."} />
    </form>
  );
}
