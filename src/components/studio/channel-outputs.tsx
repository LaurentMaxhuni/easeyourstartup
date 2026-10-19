"use client";

import { useState } from "react";
import { ArrowClockwise, Check, Copy, WarningCircle } from "@phosphor-icons/react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BrandClaim, ChannelOutput } from "@/lib/contracts";
import { CHANNEL_LABELS } from "@/lib/channels";
import { cn } from "@/lib/utils";

export function ChannelOutputs({
  outputs,
  claims,
  onChange,
  onRegenerate,
  regenerationRemaining,
  regenerationBusyChannel,
  plan = "free",
  compact = false,
}: {
  outputs: ChannelOutput[];
  claims: BrandClaim[];
  onChange: (outputs: ChannelOutput[]) => void;
  onRegenerate?: (channel: ChannelOutput["channel"]) => Promise<void>;
  regenerationRemaining?: Partial<Record<ChannelOutput["channel"], number>>;
  regenerationBusyChannel?: ChannelOutput["channel"] | null;
  plan?: "free" | "pro_lite" | "pro";
  compact?: boolean;
}) {
  const [active, setActive] = useState(outputs[0]?.channel);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [regenerationError, setRegenerationError] = useState("");
  const output = outputs.find((item) => item.channel === active) ?? outputs[0];
  const activeChannel = output?.channel;
  const regenerationsRemaining = output ? regenerationRemaining?.[output.channel] : undefined;
  const regenerationBusy = Boolean(output && regenerationBusyChannel === output.channel);
  const sourceClaimsById = new Map(
    claims
      .filter((claim) => claim.approvalState !== "rejected")
      .map((claim) => [claim.id, claim]),
  );

  if (!output) return null;

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(output.primaryCopy);
      setCopyError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(
        "Copy is unavailable here. Select the text to copy it manually.",
      );
    }
  }

  function updateCopy(value: string) {
    onChange(
      outputs.map((item) =>
        item.channel === output.channel
          ? { ...item, primaryCopy: value }
          : item,
      ),
    );
  }

  return (
    <section aria-labelledby="copy-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="copy-title"
            className={compact ? "text-sm font-semibold" : "text-xl font-semibold"}
          >
            Your posts
          </h2>
          <p className="mt-1 text-xs text-muted">
            Choose a platform. Edit the text here, then copy your post.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRegenerate && (
            <div className="text-right">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(`Replace the ${CHANNEL_LABELS[output.channel]} draft with a newly generated version?`)) return;
                  setRegenerationError("");
                  try { await onRegenerate(output.channel); }
                  catch (error) { setRegenerationError(error instanceof Error ? error.message : "Channel regeneration failed."); }
                }}
                disabled={regenerationBusy || plan === "free" || regenerationsRemaining === 0}
              >
                {regenerationBusy ? <LoadingIndicator size="sm" /> : <ArrowClockwise size={16} />}
                {regenerationBusy ? "Regenerating" : "Regenerate"}
              </Button>
              <span className="mt-1 block text-[10px] text-muted">
                {plan !== "free" ? `${regenerationsRemaining ?? "…"} of 5 left for this channel` : "Included with Pro Lite and Pro"}
              </span>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Channel outputs"
        className="mt-5 overflow-x-auto border-b border-line"
      >
        <div className="flex min-w-max">
          {outputs.map((item) => (
            <button
              type="button"
              key={item.channel}
              onClick={() => setActive(item.channel)}
              role="tab"
              id={`channel-tab-${item.channel}`}
              tabIndex={activeChannel === item.channel ? 0 : -1}
              onKeyDown={(event) => {
                const current = outputs.findIndex((entry) => entry.channel === item.channel);
                const index = event.key === "ArrowRight" ? (current + 1) % outputs.length
                  : event.key === "ArrowLeft" ? (current - 1 + outputs.length) % outputs.length
                    : event.key === "Home" ? 0 : event.key === "End" ? outputs.length - 1 : null;
                if (index === null) return;
                event.preventDefault();
                setActive(outputs[index].channel);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
              }}
              aria-selected={activeChannel === item.channel}
              aria-controls="active-channel-copy"
              className={cn(
                "border-b-2 px-3 pb-3 text-xs font-semibold transition-colors",
                activeChannel === item.channel
                  ? "border-accent text-ink"
                  : "border-transparent text-muted",
              )}
            >
              {CHANNEL_LABELS[item.channel]}
            </button>
          ))}
        </div>
      </div>
      <div id="active-channel-copy" role="tabpanel" aria-labelledby={`channel-tab-${output.channel}`}>
      <textarea
        aria-label={CHANNEL_LABELS[output.channel] + " campaign copy"}
        value={output.primaryCopy}
        onChange={(event) => updateCopy(event.target.value)}
        className={cn(
          "mt-4 w-full resize-y rounded-container border border-line bg-surface-raised text-sm leading-7",
          compact ? "min-h-[280px] p-3 text-xs leading-6" : "min-h-[420px] p-5",
        )}
      />
      </div>
      <p className="mt-2 text-right font-sans text-[10px] uppercase  text-muted">
        {output.primaryCopy.length} characters
      </p>
      {output.linkedClaimIds.length > 0 && (
        <details className="mt-3 space-y-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Check the website sources</summary>
          {output.linkedClaimIds.map((claimId) => {
            const claim = sourceClaimsById.get(claimId);
            return claim ? (
              <a
                key={claimId}
                href={claim.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-control border border-line bg-canvas p-2 text-[11px] leading-5 text-muted transition-colors hover:border-accent hover:text-ink"
              >
                <span className="block font-semibold text-ink">{claim.text}</span>
                <span className="mt-1 block truncate">{new URL(claim.sourceUrl).hostname}</span>
              </a>
            ) : (
              <Badge key={claimId} className="normal-case ">
                Source fact unavailable for {claimId.slice(0, 8)}
              </Badge>
            );
          })}
        </details>
      )}
      {output.warnings.map((warning) => (
        <p
          key={warning}
          className="mt-3 flex gap-2 text-xs leading-5 text-muted"
        >
          <WarningCircle className="mt-0.5 shrink-0" size={15} />
          {warning}
        </p>
      ))}
      {copyError && (
        <p role="alert" className="mt-3 text-xs leading-5 text-danger">
          {copyError}
        </p>
      )}
      {regenerationError && (
        <p role="alert" className="mt-3 text-xs leading-5 text-danger">{regenerationError}</p>
      )}
    </section>
  );
}
