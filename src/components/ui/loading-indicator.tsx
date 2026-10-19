import { cn } from "@/lib/utils";

type LoadingIndicatorProps = {
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

export function LoadingIndicator({
  label,
  size = "md",
  className,
}: LoadingIndicatorProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span aria-hidden="true" className={cn("loading-mark", size === "sm" ? "size-4" : "size-5")}>
        <i /><i /><i /><i />
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}
