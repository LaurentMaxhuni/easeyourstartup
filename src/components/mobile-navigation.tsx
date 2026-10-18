"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { List, X } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function MobileNavigation({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Site navigation" className="group flex size-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface-raised text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden">
          <List aria-hidden="true" size={19} className="group-data-[state=open]:hidden" />
          <X aria-hidden="true" size={19} className="hidden group-data-[state=open]:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 md:hidden" aria-label="Mobile navigation">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Explore EaseYourStartup</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link href="/#workflow">How it works</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/#examples">Examples</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/pricing">Pricing</Link></DropdownMenuItem>
        {!signedIn && <>
          <DropdownMenuItem asChild><Link href="/login">Sign in</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <ThemeToggle menuItem />
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
