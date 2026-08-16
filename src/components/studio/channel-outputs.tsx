"use client";

import { useState } from "react";
import { Check, Copy, WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChannelOutput } from "@/lib/contracts";
import { CHANNEL_LABELS } from "@/lib/channels";
import { cn } from "@/lib/utils";

export function ChannelOutputs({
  outputs,
  onChange,
  compact = false,
}: {
  outputs: ChannelOutput[];
  onChange: (outputs: ChannelOutput[]) => void;
  compact?: boolean;
}) {
  const [active, setActive] = useState(outputs[0]?.channel);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const output = outputs.find((item) => item.channel === active) ?? outputs[0];
  const activeChannel = output?.channel;

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
            Channel copy
          </h2>
          <p className="mt-1 text-xs text-muted">
            Every line stays editable.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy"}
        </Button>
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
      <textarea
        id="active-channel-copy"
        aria-label={CHANNEL_LABELS[output.channel] + " campaign copy"}
        value={output.primaryCopy}
        onChange={(event) => updateCopy(event.target.value)}
        className={cn(
          "mt-4 w-full resize-y rounded-container border border-line bg-surface-raised text-sm leading-7",
          compact ? "min-h-[280px] p-3 text-xs leading-6" : "min-h-[420px] p-5",
        )}
      />
      <p className="mt-2 text-right font-sans text-[10px] uppercase tracking-[0.1em] text-muted">
        {output.primaryCopy.length} characters
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {output.linkedClaimIds.map((claimId) => (
          <Badge key={claimId} className="normal-case tracking-normal">
            Claim {claimId.slice(0, 8)}
          </Badge>
        ))}
      </div>
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
    </section>
  );
}
