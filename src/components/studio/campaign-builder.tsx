"use client";

import { StudioActionBar } from "@/components/studio/studio-action-bar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_KINDS, CHANNELS } from "@/lib/channels";
import type { CampaignKind, Channel, NarrativeAngle, StudioDraft } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type CampaignDraft = StudioDraft;

export function CampaignBuilder({ draft, angles, status, error, resumePendingJob, isAuthenticated, onChange, onBack, onGenerate }: {
  draft: CampaignDraft;
  angles: NarrativeAngle[];
  status: "idle" | "loading" | "error";
  error: string;
  resumePendingJob: boolean;
  isAuthenticated: boolean;
  onChange: (draft: CampaignDraft) => void;
  onBack: () => void;
  onGenerate: () => Promise<void>;
}) {
  function toggleChannel(channel: Channel) {
    onChange({ ...draft, channels: draft.channels.includes(channel)
      ? draft.channels.filter((value) => value !== channel) : [...draft.channels, channel] });
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); void onGenerate(); }}
      aria-busy={status === "loading"} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Create your posts</p>
      <h1 className="mt-3 text-balance text-3xl font-semibold sm:text-4xl">What would you like to share?</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Tell us what’s new in your own words. We’ll use your website to write the posts and make a matching visual.</p>

      <fieldset disabled={status === "loading" || resumePendingJob} className="mt-8 space-y-7">
        <label className="block">
          <span className="text-sm font-semibold">What are you announcing?</span>
          <select value={draft.kind} onChange={(event) => onChange({ ...draft, kind: event.target.value as CampaignKind })}
            className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-raised px-3.5 text-sm">
            {CAMPAIGN_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">What should people know?</span>
          <Textarea className="mt-2 min-h-36" value={draft.updateDetails} required minLength={8} maxLength={2000}
            aria-describedby="announcement-help" onChange={(event) => onChange({ ...draft, updateDetails: event.target.value })}
            placeholder="We added shared project folders. Now your team can keep its work in one place. It’s available today." />
          <span id="announcement-help" className="mt-2 block text-xs leading-5 text-muted">A few sentences are enough: what’s new, who it helps, and when it’s available. Include only details that are true.</span>
        </label>

        <section aria-labelledby="channels-title">
          <h2 id="channels-title" className="text-sm font-semibold">Where will you share it?</h2>
          <p className="mt-1 text-xs text-muted">Choose the places you use. You’ll get a separate post for each.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {CHANNELS.map((channel) => {
              const selected = draft.channels.includes(channel.id);
              return <label key={channel.id} className={cn("flex cursor-pointer items-center gap-3 rounded-control border p-3 text-sm", selected ? "border-accent bg-accent/10" : "border-line bg-surface-raised")}>
                <input type="checkbox" checked={selected} onChange={() => toggleChannel(channel.id)} className="size-4 accent-[var(--accent)]" />
                {channel.name}
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
              <select value={draft.angle.id} onChange={(event) => { const angle = angles.find((item) => item.id === event.target.value); if (angle) onChange({ ...draft, angle }); }}
                className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-raised px-3.5 text-sm">
                {angles.map((angle) => <option key={angle.id} value={angle.id}>{angle.title}</option>)}
              </select>
            </label>}
          </div>
        </details>
      </fieldset>

      {error && <div role="alert" className="mt-6 rounded-control border border-danger/30 bg-surface p-4 text-sm text-danger">{error}</div>}
      <StudioActionBar backLabel="Review website details" onBack={onBack}
        nextLabel={isAuthenticated ? resumePendingJob ? "Check my posts" : status === "error" ? "Try again" : "Create my posts" : "Sign in to create posts"}
        nextType="submit" loading={status === "loading"}
        helper={resumePendingJob ? "Your request is saved. Check its progress without starting again." : "Review, edit, and copy your posts before sharing. Nothing is published automatically."} />
    </form>
  );
}
