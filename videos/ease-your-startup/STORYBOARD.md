---
format: 1920x1080
duration: 33s
message: "Turn every ship into a campaign."
arc: BAB
audience: Solo founders and lean product teams launching products or updates without dedicated marketing support
mode: collaborative
music: confident minimal tech underscore
---

# Storyboard proposal

## Video direction

- Palette: warm cream ground `bg`, near-black `text`, single cobalt `primary`, muted `text-muted`; Outfit display/body. Preserve the captured app screenshot's native colors and pixels.
- Motion: smooth `power3` settles. Reveal text and product details on spoken cues across each shot; never expose the full layout at t=0. Use still holds after the final cue; no breathing loops or drifting camera.
- Rhythm: frame 1 types in; frames 2–4 reveal proof progressively; frame 5 is a deliberate still read on the authentic visual editor; frame 6 makes the two real export actions legible; frame 7 holds the close and CTA.
- Keepouts: no invented UI, metrics, logos, browser chrome, decorative AI gradients, floating bokeh, narration as headline text, slideshow front-loads, or screensaver motion. Captions may occupy the reserved lower 17% only.

This video tells solo founders that **every product ship can become a source-backed launch campaign**. The existing copy supplies the promise; the app's real studio capture supplies product evidence. Seven beats give the promise room to land by frame 2, then show the workflow and close on the current free-scan CTA.

| Frame | Beat | On screen | Why |
| --- | --- | --- | --- |
| 01 — Beyond the blank page | hook · 4s | Existing founder-at-work image; one outcome-first line. | Starts with the founder's launch need, before naming features. |
| 02 — Turn every ship into a campaign | product_intro · 4s | The real studio screenshot resolves on the product's existing promise and mark. | Lands the core message by beat 2. |
| 03 — Start with the source | feature_showcase · 5s | Real studio screen and its Scan → Brand DNA → Campaign → Creative labels. | Gives the promise a source-grounded mechanism. |
| 04 — Meet founders where they publish | feature_showcase · 5s | X, LinkedIn, Product Hunt, and email appear beside the real studio screen. | Shows channel-native output without inventing channels. |
| 05 — Keep the product real | benefit_highlight · 5s | Existing Visual Studio screen and its faithful screenshot preview. | Connects editable templates to a true product image. |
| 06 — Review and export | benefit_highlight · 5s | Existing Preview PNG and Campaign ZIP controls; publish remains the founder's choice. | Resolves the workflow with reviewable, downloadable output. |
| 07 — Keep shipping | cta · 5s | Existing brand mark, promise, and “Free scan” action. | Gives viewers one clear next step. |

## Frame 1 — Beyond the blank page

- scene: Open on the supplied founder image and a single outcome claim.
- voiceover: “Every launch deserves more than a blank page.”
- duration: 4s
- transition_in: cut
- status: animated
- type: hook
- persuasion: Future pacing
- beat: anticipation
- blueprint: typewriter-reveal (Reproduce)
- focal: assets/founder-launch-studio.png
- roles: founder-launch-studio.png = background
- asset_candidates: assets/founder-launch-studio.png — existing founder-at-work image; source public/images/founder-launch-studio.png
- src: compositions/frames/01-beyond-blank-page.html

narrativeRole: Establish the launch moment in the viewer's language, before introducing the product.

keyMessage: A product launch should move forward without starting from a blank page.

Scene 1 (0.0–1.3s): Keep the approved founder-photo-left / copy-right layout; the image holds while the short “Ready to ship?” hook types in the upper part of the right copy block → `discrete-text-sequence` + `context-sensitive-cursor`; asymmetric 60/40.
Scene 2 (1.3–2.8s): Keep the same approved crop and hierarchy; complete “Ready to ship?” and draw the short cobalt accent beneath it → `svg-path-draw`; no camera drift.
Scene 3 (2.8–4.0s): Hold the completed line and photo for a clean read; still frame.

## Frame 2 — Turn every ship into a campaign

- scene: The real studio screenshot resolves on the existing launch-card promise and product mark.
- voiceover: “Turn every ship into a campaign.”
- duration: 4s
- transition_in: crossfade
- status: animated
- type: product_intro
- persuasion: Friction reduction
- beat: relief
- blueprint: titlecard-reveal (Reproduce)
- focal: assets/studio-capture.png
- roles: studio-capture.png = background
- asset_candidates: assets/studio-capture.png — real product screen with the existing launch promise; source public/images/studio-capture.png
- src: compositions/frames/02-turn-every-ship-into-a-campaign.html

narrativeRole: State the one-line product promise and show that the story belongs to EaseYourStartup.

keyMessage: Turn every ship into a campaign.

Scene 1 (0.0–2.8s): The real studio screenshot fills the approved upper visual region; below it, reveal only the exact product mark and “Launch studio” label from the screenshot, never a rebuilt UI → `scale-swap-transition`; preserve screenshot pixels and proportions.
Scene 2 (2.8–4.0s): Hold the full screenshot and compact identity row, still, for a clean read.

## Frame 3 — Start with the source

- scene: Keep the real studio capture intact; direct attention to its Scan, Brand DNA, Campaign, and Creative stages.
- voiceover: “Scan your public pages. Keep claims tied to their source.”
- duration: 5s
- transition_in: zoom-through
- status: animated
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: trust
- blueprint: device-surface-showcase (Adapt)
- focal: assets/studio-capture.png
- roles: studio-capture.png = background
- asset_candidates: assets/studio-capture.png — real studio screen whose navigation shows Scan, Brand DNA, Campaign, and Creative; source public/images/studio-capture.png
- src: compositions/frames/03-start-with-the-source.html

narrativeRole: Explain the evidence-first mechanism behind the campaign promise.

keyMessage: Campaign facts start from the founder's public product pages and stay source-linked.

Scene 1 (0.0–1.5s): Keep the approved screenshot-above / copy-below layout; the real studio capture remains unchanged as “A source-led workflow” and “Start with what’s live.” resolve with the first spoken cue → `scale-swap-transition`.
Scene 2 (1.5–3.4s): Reveal “Every claim has a source.” in the existing copy block as the VO reaches its source cue → `discrete-text-sequence`; no reconstructed interface or fabricated source text.
Scene 3 (3.4–5.0s): Reveal the existing Scan, Brand DNA, Campaign, and Creative stage labels in order within the approved source strip, then hold → `discrete-text-sequence`; preserve screenshot-above/copy-below placement.

## Frame 4 — Meet founders where they publish

- scene: Keep the product screen visible while the existing channel names X, LinkedIn, Product Hunt, and email take turns as the foreground proof.
- voiceover: “Build channel-ready copy for X, LinkedIn, Product Hunt, and email.”
- duration: 5s
- transition_in: push-slide LEFT
- status: animated
- type: feature_showcase
- persuasion: Feature-to-benefit translation
- beat: confidence
- blueprint: grid-card-assemble (Adapt)
- focal: assets/studio-capture.png
- roles: studio-capture.png = supporting
- asset_candidates: assets/studio-capture.png — existing studio screenshot; source public/images/studio-capture.png
- src: compositions/frames/04-meet-founders-where-they-publish.html

narrativeRole: Translate source-backed campaign generation into copy for the channels founders use.

keyMessage: One product update can be shaped for several launch channels.

Scene 1 (0.0–1.0s): Keep the approved screenshot-left / copy-right layout; “Channel-ready copy” and “One update. The channels that matter.” hold as the real product capture sits intact beside them.
Scene 2 (1.0–3.7s): Reveal X, LinkedIn, Product Hunt, and Email into their approved two-column list slots on their spoken cues → `center-outward-expansion`; no added platform logos or simulated controls.
Scene 3 (3.7–5.0s): Hold the completed channel list and screenshot, still, for a clean read.

## Frame 5 — Keep the product real

- scene: Feature the real Visual Studio capture and the selected product screenshot, without redrawing its interface.
- voiceover: “Keep the product screenshot real. Make the creative yours.”
- duration: 5s
- transition_in: crossfade
- status: animated
- type: benefit_highlight
- persuasion: Show-don't-tell proof
- beat: creative control
- blueprint: device-surface-showcase (Adapt)
- focal: assets/studio-capture.png
- roles: studio-capture.png = background
- asset_candidates: assets/studio-capture.png — authentic Visual Studio editor and screenshot preview; source public/images/studio-capture.png
- src: compositions/frames/05-keep-the-product-real.html

narrativeRole: Show how faithful source imagery remains part of an editable visual template.

keyMessage: The founder can shape the campaign without replacing the real product screenshot.

Scene 1 (0.0–1.7s): Keep the approved screenshot-left / copy-right layout; the genuine Visual Studio screen sits intact beside the “Visual studio” eyebrow and short “Keep the product real.” headline → `scale-swap-transition`.
Scene 2 (1.7–3.5s): Reveal “Your creative, your call.” beneath the headline as the embedded real preview is in view; keep screenshot proportions and all UI intact → `discrete-text-sequence`.
Scene 3 (3.5–5.0s): Hold the complete screenshot and copy block, still; no camera drift or added controls.

## Frame 6 — Review and export

- scene: Use the existing Preview PNG and Campaign ZIP controls as evidence; keep publishing as the founder's own next action.
- voiceover: “Review the evidence. Preview your visuals. Export the full launch kit.”
- duration: 5s
- transition_in: crossfade
- status: animated
- type: benefit_highlight
- persuasion: Friction reduction
- beat: clarity
- blueprint: compose
- focal: assets/studio-capture.png
- roles: studio-capture.png = background
- asset_candidates: assets/studio-capture.png — real studio view with Preview PNG and Campaign ZIP controls; source public/images/studio-capture.png
- src: compositions/frames/06-review-and-export.html

narrativeRole: Make the deliverable and founder-controlled publishing step concrete.

keyMessage: A reviewed, organized launch kit is ready for the founder to publish.

Scene 1 (0.0–1.4s): Keep the approved screenshot-above / copy-below layout; reveal the “Ready to shape” eyebrow and “Review. Preview. Export.” headline as the VO opens → `discrete-text-sequence`.
Scene 2 (1.4–2.8s): The actual Preview PNG control stays visible in the screenshot while its matching proof pill appears in the copy row on the preview cue → `scale-swap-transition`; do not simulate a click.
Scene 3 (2.8–4.0s): Reveal the Campaign ZIP proof pill on the export cue; both labels remain legible together and match the real screenshot → `scale-swap-transition`.
Scene 4 (4.0–5.0s): Hold on the screenshot and completed evidence row, still; the founder controls publishing.

## Frame 7 — Keep shipping

- scene: Return to the founder-at-work image; resolve beside it on the existing brand promise and Free scan action.
- voiceover: “Built for founders who keep shipping. Start with a free scan.”
- duration: 5s
- transition_in: zoom-through
- status: animated
- type: cta
- persuasion: Risk reversal
- beat: motivation-to-act
- blueprint: titlecard-reveal (Reproduce)
- focal: assets/founder-launch-studio.png
- roles: founder-launch-studio.png = supporting; studio-capture.png = supporting
- asset_candidates: assets/founder-launch-studio.png — reuse the approved founder-at-work image to bookend the story; source public/images/founder-launch-studio.png; assets/studio-capture.png — authentic product mark and existing campaign promise; source public/images/studio-capture.png
- src: compositions/frames/07-keep-shipping.html

narrativeRole: Close the story with one action that begins the product's existing workflow.

keyMessage: Start with a free scan, then turn the next ship into a campaign.

Scene 1 (0.0–1.6s): Return to the founder image on the left; on the right, hold the exact EaseYourStartup mark cropped from the captured product surface, “For founders who keep shipping,” and the existing campaign promise → `scale-swap-transition`; preserve the approved image-left/copy-right layout.
Scene 2 (1.6–3.4s): Make one restrained reveal of “Free scan” as the sole cobalt pill CTA below the promise while the founder photo and brand lockup hold → `scale-swap-transition`; no extra offer or invented URL.
Scene 3 (3.4–5.0s): Hold the image, logo, campaign promise, and CTA completely still through the final beat; clean finish.

## Sketch review checkpoint

The user approved all seven layouts. The reviewed wireframe is preserved at `sketch-board.html`; it uses only the existing founder image and real studio screenshot. The confirmed layouts are the source for the frame builds.
