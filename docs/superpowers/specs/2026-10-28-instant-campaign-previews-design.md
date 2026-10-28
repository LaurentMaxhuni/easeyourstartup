# Instant campaign previews

Status: approved by the user on 2026-10-28.

## Intent

Show three polished, editable campaign previews without waiting for AI design
generation. Keep custom AI design available as an explicit optional action.

## Approach

Use the template-first flow requested by the user. Build on the 11 existing
layouts in `src/lib/design-studio/templates.ts` and the existing document,
preview, editor, persistence, and export paths.

Optimizing the current mandatory AI pipeline would still leave preview latency
dependent on providers, capture imports, and multiple generation/review stages.
Ranking templates with a new model would introduce another dependency before
the first previews. Use local matching for this initial version.

## Experience

- Announcement -> three branded template previews, with no design-provider call.
- Use the current announcement and approved brand facts. Never invent marketing
  claims, metrics, or testimonials to fill a layout.
- Match layouts using brand visual character, campaign kind, headline length,
  and available images. Return three distinct compositions, not color variants.
- Reuse brand colors and supported fonts. Templates must work without a capture;
  an unavailable image must not block the first previews.
- Curate and polish the existing catalog for typography, spacing, contrast,
  text fit, and distinct composition. Add layouts only for a missing use case.
- Each preview supports selection and editing through the existing design editor.
- Primary action continues into campaign generation with the chosen design.
- Optional `Create with AI` runs the existing custom-concept workflow on demand.
  Keep the original templates and edits available; expose custom results only
  after successful completion and explicit selection.
- A slow or failed custom job does not prevent using a ready template. Preserve
  existing protection against changing the selection during campaign generation.

## State and compatibility

Persist template concepts and the selected design using existing studio/design
storage. Preserve saved AI concepts, history, revision conflict handling, and
selected-message/design handoff. Reopening a campaign must not regenerate or
replace edited designs. Brief changes mark saved concepts stale and offer an
explicit refresh rather than discarding edits.

## Verification

Test deterministic matching, three distinct eligible layouts, long copy, missing
images, saved-state recovery, selected-design handoff, and optional AI failure.
Inspect rendered previews on representative technical, playful, and restrained
brands at desktop and mobile widths. Verify no AI design request occurs on the
default preview path. Run relevant tests, lint, typecheck, and build.

## Scope

No new provider, paid service, dependency, or database migration is planned.
Jev was considered for semantic ranking; it is unnecessary for the initial
template catalog and would add latency to the immediate preview path.
