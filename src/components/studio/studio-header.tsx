import Link from "next/link";
import { Lightning } from "@phosphor-icons/react/dist/ssr";
import { AccountMenu, type AccountProfile } from "@/components/account/account-avatar-link";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function StudioHeader({ profile, plan }: { profile: AccountProfile; plan: "free" | "pro" }) {
  return (
    <header className="border-b border-line bg-canvas">
      <a
        href="#studio-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-5">
          <Logo href="/dashboard" ariaLabel="EaseYourStartup dashboard" />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden text-sm text-muted sm:block">
            Launch studio
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex">
            <Lightning size={12} weight="fill" className="mr-1 text-accent" />
            {plan === "pro" ? "Pro" : "Free preview"}
          </Badge>
          {plan === "free" && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          )}
          <AccountMenu profile={profile} />
        </div>
      </div>
    </header>
  );
}
