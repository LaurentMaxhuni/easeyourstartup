"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type LoadingIndicatorProps = {
  label?: string;
  size?: "sm" | "md";
  className?: string;
};

/**
 * A small orbital progress cue that feels at home in the studio UI without
 * taking over the surrounding control. Motion is disabled for users who
 * prefer reduced motion.
 */
export function LoadingIndicator({
  label,
  size = "md",
  className,
}: LoadingIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const sizeClass = size === "sm" ? "size-4" : "size-5";
  const coreClass = size === "sm" ? "size-1.5" : "size-2";

  return (
    <span
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-label={label ? undefined : "Loading"}
      aria-hidden={label ? undefined : true}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span aria-hidden="true" className={cn("relative inline-flex shrink-0", sizeClass)}>
        <motion.span
          className="absolute inset-0 rounded-full border border-accent/25 border-r-accent/70 border-t-accent"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 1.05, ease: "linear", repeat: Infinity }}
        />
        <motion.span
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent",
            coreClass,
          )}
          animate={
            reduceMotion
              ? undefined
              : { opacity: [0.45, 1, 0.45], scale: [0.7, 1, 0.7] }
          }
          transition={{ duration: 1.25, ease: "easeInOut", repeat: Infinity }}
        />
      </span>
      {label && <span>{label}</span>}
    </span>
  );
}
