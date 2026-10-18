import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-line bg-surface-raised px-3.5 text-sm text-ink shadow-xs placeholder:text-muted/80 transition-[border-color,background-color,box-shadow] hover:border-muted/60 focus:border-accent disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
