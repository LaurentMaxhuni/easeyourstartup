import Link from "next/link";
import { MobileNavigation } from "@/components/mobile-navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account/account-avatar-link";
import { getCurrentUser } from "@/lib/auth/server";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-xl">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-3 px-5 sm:px-6 lg:px-8">
        <Logo />
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 rounded-full border border-line/70 bg-surface/60 p-1 text-sm text-muted md:flex"
        >
          <Link className="rounded-full px-4 py-2 transition-colors hover:bg-surface-raised hover:text-ink" href="/#workflow">
            How it works
          </Link>
          <Link className="rounded-full px-4 py-2 transition-colors hover:bg-surface-raised hover:text-ink" href="/#examples">
            Examples
          </Link>
          <Link className="rounded-full px-4 py-2 transition-colors hover:bg-surface-raised hover:text-ink" href="/pricing">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <MobileNavigation signedIn={Boolean(user)} />
          {user ? (
            <AccountMenu
              profile={{
                name: user.name ?? null,
                email: user.email ?? null,
                image: user.image ?? null,
              }}
            />
          ) : (
            <div className="hidden items-center gap-3 md:flex">
              <Link href="/login" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold hover:text-accent">Sign in</Link>
              <ThemeToggle />
            </div>
          )}
          <Button asChild size="sm" className="min-h-11 px-3 text-xs">
            <Link
              href={user ? "/studio?new=1" : "/login?next=%2Fstudio%3Fnew%3D1"}
            >
              <span className="sm:hidden">Scan</span>
              <span className="hidden sm:inline">Free scan</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
