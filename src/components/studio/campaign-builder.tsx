"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { StudioActionBar } from "@/components/studio/studio-action-bar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CAMPAIGN_KINDS, CHANNELS } from "@/lib/channels";
import type {
  CampaignKind,
  Channel,
  NarrativeAngle,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type CampaignDraft = {
  kind: CampaignKind;
  goal: string;
  updateDetails: string;
  audience: string;
  launchDate: string;
  cta: string;
  angle: NarrativeAngle;
  channels: Channel[];
};

export function CampaignBuilder({
  draft,
  angles,
  status,
  error,
  isAuthenticated,
  onChange,
  onBack,
  onGenerate,
}: {
  draft: CampaignDraft;
  angles: NarrativeAngle[];
  status: "idle" | "loading" | "error";
  error: string;
  isAuthenticated: boolean;
  onChange: (draft: CampaignDraft) => void;
  onBack: () => void;
  onGenerate: () => Promise<void>;
}) {
  const goalReady = draft.goal.trim().length >= 8;
  const updateReady = draft.updateDetails.trim().length >= 8;
  const channelsReady = draft.channels.length > 0;

  function toggleChannel(channel: Channel) {
    const selected = draft.channels.includes(channel);
    onChange({
      ...draft,
      channels: selected
        ? draft.channels.filter((value) => value !== channel)
        : [...draft.channels, channel],
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onGenerate();
      }}
      className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:py-14"
    >
      <div className="grid gap-10 lg:grid-cols-[.65fr_1.35fr]">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.16em] text-accent">
            Give the update a story
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            Tell us about this launch
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-muted">
            Give the campaign one clear job. The generated copy and visuals
            will stay within the source facts the scan kept.
          </p>
          <div className="mt-8 rounded-container border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Ready when
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle
                  size={17}
                  weight={goalReady ? "fill" : "regular"}
                  className={goalReady ? "text-accent" : "text-muted"}
                />
                <span>There is one clear campaign goal.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle
                  size={17}
                  weight={updateReady ? "fill" : "regular"}
                  className={updateReady ? "text-accent" : "text-muted"}
                />
                <span>The update says what is available now.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle
                  size={17}
                  weight={channelsReady ? "fill" : "regular"}
                  className={channelsReady ? "text-accent" : "text-muted"}
                />
                <span>At least one channel is selected.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-8">
          <section className="rounded-container border border-line bg-surface-raised p-5 sm:p-7">
            <h2 className="text-lg font-semibold">The brief</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold">Campaign type</span>
                <select
                  value={draft.kind}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      kind: event.target.value as CampaignKind,
                    })
                  }
                  className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface-raised px-3.5 text-sm"
                >
                  {CAMPAIGN_KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold">Launch date</span>
                <Input
                  className="mt-2"
                  type="date"
                  value={draft.launchDate}
                  onChange={(event) =>
                    onChange({ ...draft, launchDate: event.target.value })
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold">Campaign goal</span>
                <Input
                  className="mt-2"
                  value={draft.goal}
                  onChange={(event) =>
                    onChange({ ...draft, goal: event.target.value })
                  }
                  placeholder="Get the first 50 founders to try the update"
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {draft.goal.length}/500
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold">
                  What changed or launched?
                </span>
                <Textarea
                  className="mt-2 min-h-36"
                  value={draft.updateDetails}
                  maxLength={2000}
                  onChange={(event) =>
                    onChange({ ...draft, updateDetails: event.target.value })
                  }
                  placeholder="Describe what is available, why you built it, and any important limitations."
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {draft.updateDetails.length}/2000
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold">Target audience</span>
                <Input
                  className="mt-2"
                  value={draft.audience}
                  onChange={(event) =>
                    onChange({ ...draft, audience: event.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold">Call to action</span>
                <Input
                  className="mt-2"
                  value={draft.cta}
                  onChange={(event) =>
                    onChange({ ...draft, cta: event.target.value })
                  }
                />
              </label>
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold">Choose the angle</h2>
                <p className="mt-1 text-xs text-muted">
                  This changes the story structure, not the source facts.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {angles.map((angle) => (
                <button
                  key={angle.id}
                  type="button"
                  onClick={() => onChange({ ...draft, angle })}
                  aria-pressed={draft.angle.id === angle.id}
                  className={cn(
                    "rounded-container border p-4 text-left transition-colors",
                    draft.angle.id === angle.id
                      ? "border-accent bg-accent/10"
                      : "border-line bg-surface-raised hover:border-muted",
                  )}
                >
                  <span className="text-sm font-semibold">{angle.title}</span>
                  <span className="mt-2 block text-xs leading-5 text-muted">
                    {angle.summary}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-lg font-semibold">Where should it go?</h2>
              <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-muted">
                {draft.channels.length} selected
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CHANNELS.map((channel) => {
                const selected = draft.channels.includes(channel.id);
                return (
                  <label
                    key={channel.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors",
                      selected
                        ? "border-accent bg-accent/10"
                        : "border-line bg-surface-raised hover:border-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleChannel(channel.id)}
                      className="mt-0.5 size-4 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {channel.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                        {channel.note}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <StudioActionBar
            backLabel="Back to facts"
            onBack={onBack}
            nextLabel={isAuthenticated ? "Create posts" : "Sign in to create posts"}
            nextType="submit"
            loading={status === "loading"}
            helper={
              isAuthenticated
                ? "You can edit every caption and visual after generation."
                : "Sign in is required before opening the launch studio."
            }
          />
        </div>
      </div>
    </form>
  );
}
