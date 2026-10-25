"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { designNodeStyle, type DesignAsset, type DesignNode, type DesignPage } from "@/lib/design-studio/document";
import styles from "./design-studio.module.css";

export function DesignCanvas({ page, assets, selectedId, onSelect, onMove, zoom, pan, onPan, hand, onInteraction }: {
  page: DesignPage; assets: DesignAsset[]; selectedId: string | null;
  onSelect: (id: string | null) => void; onMove: (id: string, x: number, y: number) => void;
  zoom: number; pan: { x: number; y: number }; onPan: (pan: { x: number; y: number }) => void; hand: boolean;
  onInteraction?: () => void;
}) {
  const gesture = useRef<{ id?: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null);
  function start(event: PointerEvent, node?: DesignNode) {
    if (event.button !== 0 && event.button !== 1) return;
    if (node && !hand && event.button !== 1) {
      event.stopPropagation();
      onSelect(node.id);
      if (node.locked) return;
      onInteraction?.();
      gesture.current = { id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y };
    } else {
      if (event.target === event.currentTarget) onSelect(null);
      gesture.current = { startX: event.clientX, startY: event.clientY, x: pan.x, y: pan.y };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.id) setMoving({ id: current.id, x: Math.max(-4096, Math.min(8192, Math.round(current.x + dx / zoom))), y: Math.max(-4096, Math.min(8192, Math.round(current.y + dy / zoom))) });
    else onPan({ x: current.x + dx, y: current.y + dy });
  }
  function end() {
    if (moving) onMove(moving.id, moving.x, moving.y);
    gesture.current = null;
    setMoving(null);
  }
  return <div className={`${styles.viewport} ${hand ? styles.hand : ""}`} onPointerDown={(event) => start(event)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Design canvas. Select a layer and drag to move it.">
    <div className={styles.canvasPosition} style={{ width: page.width * zoom, height: page.height * zoom, transform: `translate(${pan.x}px, ${pan.y}px)` }}>
      <div className={styles.canvas} style={{ width: page.width, height: page.height, background: page.background, transform: `scale(${zoom})` }}>
        {page.nodes.map((node) => {
          const actual = moving?.id === node.id ? { ...node, x: moving.x, y: moving.y } : node;
          const style = designNodeStyle(actual) as CSSProperties;
          if (node.fontFamily === "Outfit") style.fontFamily = "var(--font-outfit), sans-serif";
          return <div key={node.id} data-node-id={node.id} data-node-type={node.type} data-node-role={node.role} aria-label={`${node.name}${node.locked ? ", locked" : ""}`} role="button" tabIndex={node.visible ? 0 : -1} onKeyDown={(event) => { if (event.key === "Enter") onSelect(node.id); }} onPointerDown={(event) => start(event, node)} className={selectedId === node.id ? styles.selectedNode : styles.node} style={{ ...style, outlineWidth: selectedId === node.id ? 2 / zoom : undefined }}>
            {node.type === "text" ? node.text : node.type === "image" ? (
              // User assets are sanitized data URLs; native images preserve export sizing.
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={node.name} draggable={false} src={assets.find((asset) => asset.id === node.assetId)?.dataUrl} style={{ width: "100%", height: "100%", objectFit: node.fit }} />
            ) : node.type === "line" || node.type === "path" ? <svg viewBox={`0 0 ${node.width} ${node.height}`} width="100%" height="100%" aria-hidden="true">{node.type === "line" ? <line x1="0" y1="0" x2={node.width} y2={node.height} fill="none" stroke={node.stroke} strokeWidth={node.strokeWidth} /> : <path d={node.path} fill={node.fill} stroke={node.stroke} strokeWidth={node.strokeWidth} />}</svg> : null}
          </div>;
        })}
      </div>
      <span className={styles.canvasCaption}>{page.name} <span>{page.width} × {page.height}</span></span>
    </div>
  </div>;
}
