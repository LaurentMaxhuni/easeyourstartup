import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-line bg-surface-raised px-3.5 text-sm text-ink placeholder:text-muted/70 transition-[border-color,background-color] hover:border-muted focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
