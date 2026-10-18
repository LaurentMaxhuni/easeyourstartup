"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    // Export documents must remain still and use their own canvas dimensions.
    if (pathname.startsWith("/render/")) return;

    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      anchors: true,
      allowNestedScroll: true,
      respectReducedMotion: true,
      stopInertiaOnNavigate: true,
    });

    return () => lenis.destroy();
  }, [pathname]);

  return null;
}
