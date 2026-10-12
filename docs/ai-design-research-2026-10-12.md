# AI design research and implementation recommendation

Research date: 12 October 2026. Scope: improve generated campaign visuals while preserving the existing editable canvas. Findings below distinguish source inspection, documented platform capabilities, and proposed work. No live generation benchmark or provider-failure reproduction was performed.

## Diagnosis from this repository

There are two different design paths, and improving only the AI design button will leave initial campaign designs unchanged.

| Path | Current behavior | Consequence |
| --- | --- | --- |
| Campaign generation V2 | `src/lib/server/generation-v2/index.ts:197` calls `campaignDesignPlanToCanvas` after reviewing the campaign plan. | Initial canvas is assembled by deterministic geometry rather than the freeform AI canvas designer. |
| V2 canvas assembly | `src/lib/generation-v2/design-canvas.ts:55` defines fixed vertical zones; every text block starts at x=8 with width=84. CTA sits at y=84. Screenshot occupies a fixed lower strip. | Different concepts converge on the same composition. `layoutVariant` and `emphasis` do not affect this renderer. |
| Manual AI design | `src/lib/server/campaign-generator.ts:1846` requests one structured scene and validates it. | Model can choose geometry, but never sees the rendered result or receives visual repair feedback. |
| Fonts | `designFontOptions`, request data, prompt, parser, and V2 renderer enforce Outfit. | Brand typography is replaced even when brand font information exists. Changing one prompt alone cannot remove this restriction. |
| Visual evidence | `loadDesignVisualInputs` fetches only HTTP(S) images, accepts JPEG/PNG/WebP, silently skips errors, and returns at most three images. | Local `/api/assets/...` uploads and local images can be listed as assets without their pixels reaching the model. Logos may lose priority to product images. SVG references are skipped. |
| Validation | Manual parser checks schema, theme contrast, text safe areas, approved wording, and asset references. | Valid JSON can still contain weak hierarchy, unreadable per-layer contrast, clipped text, collisions, or an empty-looking composition. |
| Reliability | Manual design sets SDK retries to zero; chat path disables malformed-response and transient retries. Route converts the wrapped failure to a generic 502. | Provider problems and invalid generated designs become hard to distinguish in the UI. Underlying error is logged server-side. |

The supplied screenshot strongly resembles V2's fixed geometry: short top rule, centered copy, large unused middle, and full-width bottom CTA. This is evidence of a plausible source, not proof of the saved campaign's generation provenance. The screenshot shows a failed redesign and the preserved existing canvas; it does not establish that the failed request generated the visible design.

The exact 502 cause remains unknown without its server log/request trace. Provider capability mismatch, timeout, quota, malformed output, and validation failure need separate diagnosis. Do not label this an outage without evidence.

## Adding skills to the application AI

