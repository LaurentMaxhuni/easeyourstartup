import { Check } from "@phosphor-icons/react";
import {
  STUDIO_STAGES,
  type StudioStageId,
} from "@/lib/studio-flow";
import { cn } from "@/lib/utils";

const STUDIO_STEPS = STUDIO_STAGES;

export type StudioStep = StudioStageId;

export function StepNav({
  current,
  available,
  onChange,
}: {
  current: StudioStep;
  available: StudioStep[];
  onChange: (step: StudioStep) => void;
}) {
  const currentIndex = STUDIO_STEPS.findIndex((step) => step.id === current);
  return (
    <nav
      aria-label="Campaign steps"
      className="border-b border-line bg-surface-raised"
    >
      <ol className="mx-auto flex max-w-[1600px] overflow-x-auto px-4 sm:px-6">
        {STUDIO_STEPS.map((step, index) => {
          const enabled = available.includes(step.id);
          const completed = index < currentIndex;
          return (
            <li key={step.id} className="min-w-fit">
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onChange(step.id)}
                aria-current={step.id === current ? "step" : undefined}
                aria-label={step.label + ": " + step.description}
                title={step.description}
                className={cn(
                  "flex h-14 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  step.id === current
                    ? "border-accent text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full border font-sans text-[10px]",
                    completed
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line",
                  )}
                >
                  {completed ? <Check size={12} weight="bold" /> : index + 1}
                </span>
                <span className="whitespace-nowrap">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
