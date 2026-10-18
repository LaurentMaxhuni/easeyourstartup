import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-control border border-line bg-surface-raised px-3.5 py-3 text-sm leading-6 text-ink shadow-xs placeholder:text-muted/80 transition-colors hover:border-muted/60 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
