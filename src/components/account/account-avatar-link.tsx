"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretDown, CreditCard, SignOut, SpinnerGap, UserCircle } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out. Try again.");
      setOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const avatar = <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface text-xs font-semibold text-ink">
    {profile.image ? <Image src={profile.image} alt="" fill sizes="36px" unoptimized referrerPolicy="no-referrer" className="object-cover" />
      : initials ? <span aria-hidden="true">{initials}</span> : <UserCircle aria-hidden="true" size={21} />}
  </span>;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Profile menu" title="Profile menu"
          className="group flex shrink-0 cursor-pointer items-center gap-1 rounded-full p-1 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas data-[state=open]:bg-surface">
          {avatar}
          <CaretDown aria-hidden="true" size={12} className="mr-1 hidden text-muted transition-transform group-data-[state=open]:rotate-180 sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" aria-label="Account menu">
        <div className="flex items-center gap-3 px-3 py-3">
          {avatar}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{profile.name?.trim() || "Account"}</p>
            {profile.email && <p className="mt-0.5 truncate text-xs text-muted">{profile.email}</p>}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/settings/account"><UserCircle aria-hidden="true" size={18} />Account settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings/billing"><CreditCard aria-hidden="true" size={18} />Billing</Link></DropdownMenuItem>
        <ThemeToggle menuItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={(event) => { event.preventDefault(); void signOut(); }}>
          {signingOut ? <SpinnerGap aria-hidden="true" size={18} className="animate-spin motion-reduce:animate-none" /> : <SignOut aria-hidden="true" size={18} />}
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {error && <p role="alert" className="px-3 py-2 text-xs leading-5 text-danger">{error}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
