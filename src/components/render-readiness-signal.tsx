"use client";

import { useEffect } from "react";

export function RenderReadinessSignal() {
  useEffect(() => {
    const animations = document.getAnimations();
    for (const animation of animations) {
      try {
        animation.pause();
        animation.currentTime = 0;
      } catch {
        // An unsupported animation should not hold the render open.
      }
    }

    const images = Array.from(document.images).map((image) =>
      image.decode().catch(() => undefined),
    );
    void Promise.all([document.fonts.ready, ...images]).then(() => {
      document.documentElement.dataset.renderReady = "true";
    });
  }, []);

  return null;
}
