import Link from "next/link";
import { List, X } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account/account-avatar-link";
import { getCurrentUser } from "@/lib/auth/server";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="relative sticky top-0 z-50 border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-control focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 text-sm text-muted md:flex"
        >
          <Link className="transition-colors hover:text-ink" href="/#workflow">
            How it works
          </Link>
          <Link className="transition-colors hover:text-ink" href="/#examples">
            Examples
          </Link>
          <Link className="transition-colors hover:text-ink" href="/pricing">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <details className="group relative md:hidden">
            <summary
              aria-label="Open site navigation"
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-control border border-line bg-surface-raised text-ink transition-colors hover:bg-surface [&::-webkit-details-marker]:hidden"
            >
              <List
                aria-hidden="true"
                size={19}
                className="group-open:hidden"
              />
              <X
                aria-hidden="true"
                size={19}
                className="hidden group-open:block"
              />
            </summary>
            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[60] w-64 rounded-container border border-line bg-surface-raised p-2 shadow-[0_20px_50px_rgba(23,25,23,0.14)]">
              <p className="px-3 py-2 font-sans text-[10px] uppercase  text-muted">
                Explore EaseYourStartup
              </p>
              <nav aria-label="Mobile navigation" className="grid gap-1">
                <Link
                  href="/#workflow"
                  className="rounded-control px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface"
                >
                  How it works
                </Link>
                <Link
                  href="/#examples"
                  className="rounded-control px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface"
                >
                  Examples
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-control px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface"
                >
                  Pricing
                </Link>
                {!user && <Link href="/login" className="rounded-control px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface">Sign in</Link>}
              </nav>
              {!user ? (
                <div className="mt-2 border-t border-line pt-2">
                  <ThemeToggle />
                </div>
              ) : null}
            </div>
          </details>
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
