"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { designNodeStyle, type DesignAsset, type DesignPage } from "@/lib/design-studio/document";
import { DESIGN_FONTS, DESIGN_FONT_URL_PREFIX, designFontFaceCss } from "@/lib/design-studio/fonts";

const FONT_FACE_CSS = designFontFaceCss(DESIGN_FONTS, (file) => `${DESIGN_FONT_URL_PREFIX}${file}`);

// Read-only page render using the same style compiler as the editor and export.
export function DesignPagePreview({ page, assets, label }: { page: DesignPage; assets: DesignAsset[]; label: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / page.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [page.width]);

  return (
    <div ref={frame} role="img" aria-label={label} className="relative overflow-hidden" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
      <style>{FONT_FACE_CSS}</style>
      <div aria-hidden="true" style={{ position: "relative", isolation: "isolate", overflow: "hidden", width: page.width, height: page.height, background: page.background, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {page.nodes.map((node) => {
          const style = designNodeStyle(node) as CSSProperties;
          if (node.fontFamily === "Outfit") style.fontFamily = "var(--font-outfit), sans-serif";
          return (
            <div key={node.id} style={style}>
              {node.type === "text" ? node.text : node.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- sanitized data URL asset
                <img alt="" src={assets.find((asset) => asset.id === node.assetId)?.dataUrl} style={{ width: "100%", height: "100%", objectFit: node.fit }} />
              ) : node.type === "line" || node.type === "path" ? (
                <svg viewBox={`0 0 ${node.width} ${node.height}`} width="100%" height="100%">
                  {node.type === "line"
                    ? <line x1="0" y1="0" x2={node.width} y2={node.height} fill="none" stroke={node.stroke} strokeWidth={node.strokeWidth} />
                    : <path d={node.path} fill={node.fill} stroke={node.stroke} strokeWidth={node.strokeWidth} />}
                </svg>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
