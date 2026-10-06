"use client";

import { useEffect } from "react";

export function RenderReadinessSignal() {
  useEffect(() => {
    let active = true;
    const dataset = document.documentElement.dataset;
    dataset.renderReady = "false";
    dataset.renderError = "false";
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
      Promise.resolve().then(() => image.decode()),
    );
    void Promise.all([document.fonts.ready, ...images]).then(
      () => { if (active) dataset.renderReady = "true"; },
      () => { if (active) dataset.renderError = "true"; },
    );
    return () => { active = false; };
  }, []);

  return null;
}
