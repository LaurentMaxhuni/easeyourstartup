"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";
import type {} from "react/canary";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/render/")) return children;

  return (
    <ViewTransition
      key={pathname}
      name="page-route"
      share="page-route"
      enter="page-route"
      exit="page-route"
      default="none"
    >
      <div className="page-transition">{children}</div>
    </ViewTransition>
  );
}
