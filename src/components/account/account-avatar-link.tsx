"use client";

import Image from "next/image";
import Link from "next/link";
import { CreditCard, SignOut, UserCircle } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth/client";

export type AccountProfile = {
  name: string | null;
  email: string | null;
  image: string | null;
};

function initialsFor(profile: AccountProfile) {
  const label = profile.name?.trim() || profile.email?.trim().split("@")[0] || "";
  const parts = label
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase())
      .join("");
  }
  return parts[0]?.slice(0, 2).toLocaleUpperCase() ?? "";
}

export function AccountMenu({ profile }: { profile: AccountProfile }) {
  const initials = initialsFor(profile);

  return (
    <details className="group relative shrink-0">
      <summary
        aria-label="Open profile menu"
        title="Profile menu"
        className="relative flex size-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full border border-line bg-surface-raised text-xs font-semibold text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas [&::-webkit-details-marker]:hidden"
      >
        {profile.image ? (
          <Image
            src={profile.image}
            alt=""
            fill
            sizes="40px"
            unoptimized
            referrerPolicy="no-referrer"
            className="object-cover"
          />
        ) : initials ? (
          <span aria-hidden="true">{initials}</span>
        ) : (
          <UserCircle aria-hidden="true" size={20} weight="regular" />
        )}
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[70] w-64 rounded-container border border-line bg-surface-raised p-2 shadow-[0_20px_50px_rgba(23,25,23,0.14)]">
        <div className="border-b border-line px-3 pb-3 pt-2">
          <p className="truncate text-sm font-semibold text-ink">
            {profile.name?.trim() || "Account"}
          </p>
          {profile.email ? (
            <p className="mt-0.5 truncate text-xs text-muted">{profile.email}</p>
          ) : null}
        </div>
        <nav aria-label="Account menu" className="mt-2 grid gap-1">
          <Link
            href="/settings/billing"
            className="flex items-center gap-2 rounded-control px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <CreditCard aria-hidden="true" size={17} />
            Billing
          </Link>
          <Link
            href="/settings/account"
            className="flex items-center gap-2 rounded-control px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <UserCircle aria-hidden="true" size={17} />
            Account settings
          </Link>
          <div className="flex items-center justify-between rounded-control px-3 py-1.5">
            <span className="text-sm font-medium text-ink">Theme</span>
            <ThemeToggle />
          </div>
          <button
            type="button"
            className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/");
            }}
          >
            <SignOut aria-hidden="true" size={17} />
            Sign out
          </button>
        </nav>
      </div>
    </details>
  );
}
