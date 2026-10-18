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

    // Radix locks native scrolling; pause Lenis too so its RAF cannot move the background.
    const syncScrollLock = () => {
      if (document.body.hasAttribute("data-scroll-locked")) lenis.stop();
      else lenis.start();
    };
    const observer = new MutationObserver(syncScrollLock);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] });
    syncScrollLock();

    return () => {
      observer.disconnect();
      lenis.destroy();
    };
  }, [pathname]);

  return null;
}
