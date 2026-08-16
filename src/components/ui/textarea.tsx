import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-control border border-line bg-surface-raised px-3.5 py-3 text-sm leading-6 text-ink placeholder:text-muted/70 transition-colors hover:border-muted focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
