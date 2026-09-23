import {
  creativeCodeBundleSchema,
  type CreativeCodeBundle,
  type CreativeComposition,
} from "@/lib/contracts";

const PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "navigate-to 'none'",
].join("; ");

const UNSAFE_HTML = /<(?:base|embed|form|frame|iframe|link|meta|object|script|style)\b|\b(?:on\w+|style|src|href|action)\s*=/i;
const UNSAFE_CSS = /@import|\burl\s*\(|\bexpression\s*\(|\bbehavior\s*:/i;
// This blocks obvious unsupported model output. The iframe sandbox and CSP below
// remain the security boundary because text filters cannot prove JavaScript safe.
const UNSAFE_JAVASCRIPT = /(?:\bimport\s*\(|\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|globalThis|self|(?:window\.)?(?:parent|top|opener|location|open)|(?:document\.)?(?:cookie|domain|location|write|open)|(?:local|session)Storage|indexedDB|postMessage|importScripts|eval|Function|constructor)\b)/;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function preventClosingTag(value: string, tag: "script" | "style") {
  return value.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

function isString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function safeFontFamily(value: string | undefined, fallback: string) {
  const cleaned = (value ?? fallback).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  return cleaned || fallback;
}

export function isSafeCreativeCodeBundle(value: CreativeCodeBundle) {
  return (
    !UNSAFE_HTML.test(value.html) &&
    !UNSAFE_CSS.test(value.css) &&
    !UNSAFE_JAVASCRIPT.test(value.javascript)
  );
}

export function createDeterministicCreativeCodeBundle(
  composition: Pick<CreativeComposition, "tokens" | "text">,
): CreativeCodeBundle {
  const { tokens, text } = composition;
  const bodyFont = safeFontFamily(
    tokens.bodyFontFamily ?? tokens.fontFamily,
    "Trebuchet MS",
  );
  const headingFont = safeFontFamily(
    tokens.headingFontFamily ?? tokens.fontFamily,
    "Georgia",
  );
  const radius = Math.max(0, Math.min(32, tokens.radius ?? 8));
  const spacing = Math.max(6, Math.min(40, tokens.spacing ?? 16));
  const ctaLiteral = JSON.stringify(text.cta).replaceAll("<", "\\u003c");
  return creativeCodeBundleSchema.parse({
    html: `<main class="launch-preview" data-launch-preview>
  <div class="launch-preview__copy">
    <p class="launch-preview__eyebrow">${escapeHtml(text.eyebrow)}</p>
    <h1>${escapeHtml(text.headline)}</h1>
    <p class="launch-preview__summary">${escapeHtml(text.subheadline)}</p>
    <p class="launch-preview__body">${escapeHtml(text.body)}</p>
    <button type="button" class="launch-preview__cta">${escapeHtml(text.cta)}</button>
    <p class="launch-preview__footer">${escapeHtml(text.footer)}</p>
  </div>
  <div class="launch-preview__visual" aria-hidden="true">
    <div class="launch-preview__visual-header"><span>Launch workspace</span><span>READY</span></div>
    <div class="launch-preview__visual-main">
      <div class="launch-preview__visual-sidebar"><i></i><i></i><i></i><i></i></div>
      <div class="launch-preview__visual-content">
        <div class="launch-preview__visual-line launch-preview__visual-line--wide"></div>
        <div class="launch-preview__visual-line launch-preview__visual-line--short"></div>
        <div class="launch-preview__visual-grid"><i></i><i></i><i></i></div>
        <div class="launch-preview__visual-chart"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
    </div>
  </div>
</main>`,
    css: `.launch-preview {
  --preview-radius: ${radius}px;
  --preview-space: ${spacing}px;
  --preview-line: color-mix(in srgb, ${tokens.foreground} 22%, transparent);
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.72fr);
  align-items: center;
  min-height: 100vh;
  gap: clamp(2rem, 7vw, 7rem);
  padding: clamp(2rem, 8vw, 7rem);
  border-inline-start: 0.55rem solid ${tokens.accent};
  color: ${tokens.foreground};
  background: ${tokens.background};
  font-family: "${bodyFont}", "Trebuchet MS", sans-serif;
}
.launch-preview__copy { display: grid; gap: var(--preview-space); }
.launch-preview h1 { max-width: 12ch; margin: 0; font-family: "${headingFont}", Georgia, serif; font-size: clamp(2.5rem, 8vw, 6rem); line-height: 0.96; letter-spacing: -0.035em; }
.launch-preview__eyebrow, .launch-preview__footer { margin: 0; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.launch-preview__summary, .launch-preview__body { max-width: 48rem; margin: 0; line-height: 1.55; }
.launch-preview__cta { width: fit-content; border: 0; border-radius: var(--preview-radius); padding: 0.8rem 1.1rem; color: ${tokens.background}; background: ${tokens.foreground}; font: inherit; font-weight: 700; cursor: pointer; transition: transform 180ms ease, background-color 180ms ease; }
.launch-preview__cta:hover { transform: translateY(-2px); background: ${tokens.accent}; }
.launch-preview__cta:focus-visible { outline: 3px solid ${tokens.accent}; outline-offset: 3px; }
.launch-preview__visual { overflow: hidden; border: 1px solid var(--preview-line); border-radius: var(--preview-radius); background: color-mix(in srgb, ${tokens.foreground} 8%, transparent); box-shadow: 0 2rem 5rem color-mix(in srgb, ${tokens.foreground} 14%, transparent); }
.launch-preview__visual-header { display: flex; justify-content: space-between; padding: 0.8rem 1rem; border-bottom: 1px solid var(--preview-line); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.launch-preview__visual-main { display: grid; grid-template-columns: 2.4rem 1fr; min-height: 18rem; }
.launch-preview__visual-sidebar { display: grid; align-content: start; gap: 0.7rem; padding: 1rem 0.7rem; border-inline-end: 1px solid var(--preview-line); }
.launch-preview__visual-sidebar i, .launch-preview__visual-grid i, .launch-preview__visual-chart i { display: block; border-radius: calc(var(--preview-radius) / 2); background: ${tokens.foreground}; opacity: 0.28; }
.launch-preview__visual-sidebar i { height: 0.45rem; }
.launch-preview__visual-sidebar i:first-child { background: ${tokens.accent}; opacity: 1; }
.launch-preview__visual-content { display: grid; align-content: start; gap: 1rem; padding: 1.4rem; }
.launch-preview__visual-line { height: 0.7rem; border-radius: calc(var(--preview-radius) / 2); background: ${tokens.foreground}; opacity: 0.72; }
.launch-preview__visual-line--wide { width: 70%; }
.launch-preview__visual-line--short { width: 42%; opacity: 0.26; }
.launch-preview__visual-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
.launch-preview__visual-grid i { height: 3.6rem; border: 1px solid var(--preview-line); opacity: 0.16; }
.launch-preview__visual-chart { display: flex; align-items: end; gap: 0.55rem; height: 5rem; padding-top: 1rem; border-top: 1px solid var(--preview-line); }
.launch-preview__visual-chart i { flex: 1; height: 35%; opacity: 0.55; }
.launch-preview__visual-chart i:nth-child(2) { height: 58%; }
.launch-preview__visual-chart i:nth-child(3) { height: 44%; }
.launch-preview__visual-chart i:nth-child(4) { height: 78%; background: ${tokens.accent}; opacity: 1; }
.launch-preview__visual-chart i:nth-child(5) { height: 92%; }
.launch-preview[data-state="ready"] .launch-preview__visual { border-color: ${tokens.accent}; }
@media (max-width: 52rem) { .launch-preview { grid-template-columns: 1fr; gap: 2.5rem; } .launch-preview__visual { order: -1; } }
@media (prefers-reduced-motion: reduce) { .launch-preview__cta { transition: none; } .launch-preview__cta:hover { transform: none; } }`,
    javascript: `const preview = document.querySelector("[data-launch-preview]");
if (preview) {
  preview.dataset.ready = "true";
  const cta = preview.querySelector(".launch-preview__cta");
  if (cta) {
    cta.addEventListener("click", () => {
      const ready = preview.dataset.state === "ready";
      preview.dataset.state = ready ? "idle" : "ready";
      cta.textContent = ready ? ${ctaLiteral} : "Ready to launch";
    });
  }
}`,
  });
}

export function normalizeCreativeCodeBundle(
  value: unknown,
  fallback: Pick<CreativeComposition, "tokens" | "text">,
): CreativeCodeBundle {
  try {
    return normalizeCreativeCodeBundleStrict(value);
  } catch {
    return createDeterministicCreativeCodeBundle(fallback);
  }
}

/**
 * Validates provider-authored code without silently replacing it. Callers that
 * need to report whether an AI response was usable should use this strict
 * variant and handle the error as a provider failure.
 */
export function normalizeCreativeCodeBundleStrict(value: unknown): CreativeCodeBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI returned no code bundle.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isString(candidate.html, 50_000) ||
    !isString(candidate.css, 50_000) ||
    !isString(candidate.javascript, 30_000)
  ) {
    throw new Error("AI returned an incomplete code bundle.");
  }
  const code = creativeCodeBundleSchema.parse({
    html: candidate.html.trim(),
    css: candidate.css.trim(),
    javascript: candidate.javascript.trim(),
  });
  if (!isSafeCreativeCodeBundle(code)) {
    throw new Error("AI returned code using a blocked capability.");
  }
  return code;
}

export function buildSandboxedPreviewDocument(code: CreativeCodeBundle) {
  const safeCode = isSafeCreativeCodeBundle(code) ? code : null;
  if (!safeCode) {
    return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><p>Preview blocked because the edited code uses unsupported capabilities.</p>`;
  }
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="referrer" content="no-referrer">\n  <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">\n  <style>${preventClosingTag(safeCode.css, "style")}</style>\n</head>\n<body>\n${safeCode.html}\n<script>${preventClosingTag(safeCode.javascript, "script")}</script>\n</body>\n</html>`;
}
