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
  return creativeCodeBundleSchema.parse({
    html: `<main class="launch-preview" data-launch-preview>\n  <p class="launch-preview__eyebrow">${escapeHtml(text.eyebrow)}</p>\n  <h1>${escapeHtml(text.headline)}</h1>\n  <p class="launch-preview__summary">${escapeHtml(text.subheadline)}</p>\n  <p class="launch-preview__body">${escapeHtml(text.body)}</p>\n  <button type="button" class="launch-preview__cta">${escapeHtml(text.cta)}</button>\n  <p class="launch-preview__footer">${escapeHtml(text.footer)}</p>\n</main>`,
    css: `.launch-preview {\n  box-sizing: border-box;\n  display: grid;\n  min-height: 100vh;\n  place-content: center;\n  gap: 1rem;\n  padding: clamp(2rem, 8vw, 7rem);\n  color: ${tokens.foreground};\n  background: radial-gradient(circle at 85% 10%, ${tokens.accent}, transparent 42%), ${tokens.background};\n  font-family: ui-sans-serif, system-ui, sans-serif;\n}\n.launch-preview h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 8vw, 6rem); line-height: 0.96; }\n.launch-preview__eyebrow, .launch-preview__footer { margin: 0; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }\n.launch-preview__summary, .launch-preview__body { max-width: 48rem; margin: 0; line-height: 1.55; }\n.launch-preview__cta { width: fit-content; border: 0; border-radius: 999px; padding: 0.8rem 1.1rem; color: ${tokens.accent}; background: ${tokens.foreground}; font: inherit; font-weight: 700; }`,
    javascript: `const preview = document.querySelector("[data-launch-preview]");\nif (preview) {\n  preview.dataset.ready = "true";\n}`,
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
