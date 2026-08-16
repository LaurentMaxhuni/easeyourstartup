import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

export function StudioActionBar({
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextType = "button",
  loading = false,
  helper,
}: {
  backLabel: string;
  onBack: () => void;
  nextLabel: string;
  onNext?: () => void;
  nextType?: "button" | "submit";
  loading?: boolean;
  helper: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 mt-10 flex flex-col gap-3 border-t border-line bg-canvas/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft size={16} />
        {backLabel}
      </Button>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <p
          aria-live="polite"
          className="text-center text-xs leading-5 text-muted sm:text-right"
        >
          {helper}
        </p>
        <Button
          type={nextType}
          onClick={nextType === "button" ? onNext : undefined}
          disabled={loading}
          size="lg"
        >
          {loading ? (
            <LoadingIndicator size="sm" />
          ) : (
            <ArrowRight size={18} />
          )}
          {loading ? "Working" : nextLabel}
        </Button>
      </div>
    </div>
  );
}
