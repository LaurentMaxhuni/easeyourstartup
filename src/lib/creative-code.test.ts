import { describe, expect, it } from "vitest";
import { DEMO_COMPOSITION } from "@/lib/demo-data";
import {
  buildSandboxedPreviewDocument,
  createDeterministicCreativeCodeBundle,
  normalizeCreativeCodeBundle,
  normalizeCreativeCodeBundleStrict,
} from "@/lib/creative-code";

describe("creative code bundles", () => {
  it("creates a complete HTML, CSS, and JavaScript fallback without external assets", () => {
    const bundle = createDeterministicCreativeCodeBundle(DEMO_COMPOSITION);

    expect(bundle.html).toContain("data-launch-preview");
    expect(bundle.css).toContain(DEMO_COMPOSITION.tokens.background);
    expect(bundle.javascript).toContain("document.querySelector");
    expect(bundle.html).not.toMatch(/\bsrc\s*=|\bhref\s*=/i);
  });

  it("replaces unsafe model code with a deterministic editable bundle", () => {
    const bundle = normalizeCreativeCodeBundle(
      {
        html: '<img src="https://untrusted.example/image.png">',
        css: "@import url(https://untrusted.example/styles.css);",
        javascript: "fetch('https://untrusted.example');",
      },
      DEMO_COMPOSITION,
    );

    expect(bundle.html).toContain("data-launch-preview");
    expect(bundle.html).not.toContain("untrusted.example");
  });

  it("blocks navigation and parent-window APIs in editable preview code", () => {
    const bundle = normalizeCreativeCodeBundle(
      {
        html: '<main data-launch-preview>Preview</main>',
        css: "main { color: #f4f3ef; }",
        javascript: "parent.postMessage('leak', '*'); location.assign('/login');",
      },
      DEMO_COMPOSITION,
    );

    expect(bundle.javascript).toContain("document.querySelector");
  });

  it("rejects dynamic access and executable-code loaders", () => {
    const bundle = normalizeCreativeCodeBundle(
      {
        html: '<main data-launch-preview>Preview</main>',
        css: "main { color: #f4f3ef; }",
        javascript:
          'globalThis["parent"]["post" + "Message"]("leak", "*"); import("data:text/javascript,1"); [].filter.constructor("alert(1)")();',
      },
      DEMO_COMPOSITION,
    );

    expect(bundle.javascript).toContain("document.querySelector");
  });

  it("keeps all styling in the CSS bundle instead of model markup", () => {
    const bundle = normalizeCreativeCodeBundle(
      {
        html: '<main style="background: url(https://untrusted.example)"><style>@import url(https://untrusted.example)</style></main>',
        css: "main { color: #f4f3ef; }",
        javascript:
          'const preview = document.querySelector("[data-launch-preview]");',
      },
      DEMO_COMPOSITION,
    );

    expect(bundle.html).toContain("data-launch-preview");
    expect(bundle.html).not.toContain("untrusted.example");
  });

  it("reports blocked provider code instead of silently treating it as AI", () => {
    expect(() =>
      normalizeCreativeCodeBundleStrict({
        html: '<main style="color:red">Unsafe</main>',
        css: "main { color: red; }",
        javascript: "document.querySelector('main')",
      }),
    ).toThrow(/blocked capability/i);
  });

  it("wraps executable preview code in a restrictive sandbox document", () => {
    const document = buildSandboxedPreviewDocument(
      createDeterministicCreativeCodeBundle(DEMO_COMPOSITION),
    );

    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("form-action 'none'");
  });
});
