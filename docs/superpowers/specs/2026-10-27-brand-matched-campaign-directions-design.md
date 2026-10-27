# Brand-matched campaign directions

## Intent

Give founders three distinct, editable campaign concepts that feel at home on their website. Each pairs a different message with an actual post design. Founders choose and refine a concept before generating the rest of the campaign.

## Experience

After reviewing their scanned brand and entering an announcement, the founder sees three rendered post previews. Each has a short description of its message and visual approach. All three use the same product facts and announcement but explore different angles and compositions. The website informs typography, color, spacing, imagery, and overall character; the scan must not invent logos or claims.

Clicking a preview opens a larger editing view using the existing design studio. The founder can change its message, text, and design, then return to the comparison. Edits belong to that concept. The founder selects one and generates the campaign; its approved message guides the channel copy, and its edited document becomes the campaign visual. Other concepts remain available to revisit. The selected visual remains editable after generation.

When a scan misses brand assets or its interpretation is wrong, the founder can correct the brand and supply assets. Loading, partial results, failures, retries, and unavailable visual analysis must be clear. Existing saved campaigns must continue to open.

## Approaches

- Moodboards: fast, but do not show the actual composition. Rejected in favor of post previews.
- Actual post previews: reuse the design studio's editable documents, rendering, variants, and durable jobs. Chosen because founders can judge and edit what they will use. Generation latency and provider costs must be visible and bounded.
- Inline editing on all comparison cards: convenient for small text changes but constrains design editing and comparison. A larger editor is the recommended default; retain the comparison when returning.

## Design boundaries

- Use the website capture as a visual reference, separately from any image placed in the design. Treat extracted style as an inference, not a verified brand guide. Preserve uploaded assets and do not fabricate logos.
- Reuse existing safe rendering and validated editable documents. Persist each concept, its edits, selection, and job state through refresh and resume. Preserve local work on save conflicts.
- The current design pipeline shares one generated copy across directions; extend it so each concept has its own message. Campaign IDs arise when generation is queued, so pre-generation concepts need draft or project ownership and a safe association with the resulting campaign.
- Ensure the selected concept's edited message informs campaign generation without inventing unsupported claims. Do not silently replace the selected design with a newly seeded template.
- Recheck text fit after edits, and export the selected saved document revision.
- Define how a changed announcement, brand, or asset makes existing previews stale; never discard edits silently. Support retrying failures without losing successful concepts.
- Keep unselected concepts available when returning from a completed campaign, subject to existing workspace access controls and storage limits.
- Respect existing usage limits, cancellation, durable jobs, and accessible keyboard and screen-reader interactions. Make cost and waiting behavior appropriate to existing product policies.
- Do not introduce social publishing or require a particular AI provider. Evaluate any model on representative sites and briefs before choosing it.

## Verification

Evaluate real rendered concepts across contrasting websites and briefs for brand fit, distinctness, readability, message accuracy, and usefulness. Exercise missing assets, unavailable vision, provider failure, partial results, retries, refresh/resume, changed inputs, edit persistence, conflict handling, access isolation, and export fidelity. Confirm the generated campaign reflects the chosen edited message and the final visual matches the chosen document. Automated layout checks do not by themselves prove design quality.
