import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  href = "/",
  ariaLabel = "EaseYourStartup home",
}: {
  compact?: boolean;
  href?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 font-semibold "
      aria-label={ariaLabel}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-control bg-accent text-accent-ink">
        <ArrowUpRight size={18} weight="bold" />
      </span>
      {!compact && <span>EaseYourStartup</span>}
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-control bg-accent text-accent-ink",
        className,
      )}
    >
      <ArrowUpRight size={18} weight="bold" />
    </span>
  );
}
