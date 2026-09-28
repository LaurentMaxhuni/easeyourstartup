"use client";

import { useEffect } from "react";
import type { BrandFontAsset, CreativeComposition } from "@/lib/contracts";

function fontFaceRule(asset: BrandFontAsset) {
  const family = asset.family.trim();
  if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(family)) return "";

  let remoteUrl: URL;
  try {
    remoteUrl = new URL(asset.url);
  } catch {
    return "";
  }
  if (
    !["https:", "http:"].includes(remoteUrl.protocol) ||
    remoteUrl.username ||
    remoteUrl.password
  ) {
    return "";
  }

  const weight = /^(?:normal|bold|[1-9]00|[1-9]00\s+[1-9]00)$/i.test(asset.weight)
    ? asset.weight
    : "normal";
  const style = ["normal", "italic", "oblique"].includes(asset.style)
    ? asset.style
    : "normal";
  const unicodeRange = asset.unicodeRange && /^[uU0-9a-fA-F?+,\s-]{1,400}$/.test(asset.unicodeRange)
    ? `unicode-range:${asset.unicodeRange};`
    : "";
  const proxyUrl = `/api/font-proxy?${new URLSearchParams({ url: remoteUrl.toString() })}`;

  return `@font-face{font-family:"${family}";src:url("${proxyUrl}");font-weight:${weight};font-style:${style};font-display:swap;${unicodeRange}}`;
}

export function BrandFontLoader({
  fontAssets,
  composition,
}: {
  fontAssets: BrandFontAsset[];
  composition: CreativeComposition;
}) {
  const usedFamilies = new Set(
    [
      composition.tokens.fontFamily,
      composition.tokens.headingFontFamily,
      composition.tokens.bodyFontFamily,
      ...(composition.elements ?? []).flatMap((element) =>
        element.kind === "text" ? [element.fontFamily] : [],
      ),
    ]
      .filter((family): family is string => Boolean(family))
      .map((family) => family.trim().toLowerCase()),
  );
  const styles = fontAssets
    .filter((asset) => usedFamilies.has(asset.family.trim().toLowerCase()))
    .map(fontFaceRule)
    .filter(Boolean)
    .join("\n");

  useEffect(() => {
    if (!styles) return;
    const style = document.createElement("style");
    style.dataset.brandFonts = "true";
    style.textContent = styles;
    document.head.appendChild(style);
    return () => style.remove();
  }, [styles]);

  return null;
}
