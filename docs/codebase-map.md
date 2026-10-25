# Codebase map

Verified against source on 2026-10-19, starting at commit `9257d2a`.
Persistent project context for future coding sessions. Update affected sections
when behavior or structure changes; use Git for the chronological change history.

## Product

EaseYourStartup turns a public product URL into a source-backed launch campaign
for solo founders. Main flow: scan website -> curate Brand DNA -> choose campaign
brief and channels -> generate copy -> edit visuals -> export launch kit.
Promise: **Turn every ship into a campaign.**

Campaigns cover launches, updates, milestones, waitlists, promotions, and custom
briefs. Channels: X, LinkedIn, Product Hunt, Reddit, Hacker News, Instagram,
Threads, Facebook, and email. Social publishing, authenticated-site capture,
video generation, agency white-labeling, and team approvals remain outside the
current product scope. `videos/ease-your-startup/` is a separate HyperFrames
asset project with its own instructions, not the SaaS runtime.

## Stack and commands

- Next.js App Router 16.3.x, React 19.2, TypeScript, Tailwind CSS 4; `@/` maps to `src/`.
- Node >=22, pnpm 10.26.2. Exact dependency versions live in `package.json` and `pnpm-lock.yaml`.
- Neon Postgres + Neon Auth; Inngest jobs; Paddle billing; Browserless capture/export; private S3-compatible image storage.
- `pnpm dev`: starts Next.js and, when local Inngest is configured, supervises its worker. Worker logs: `output/local-worker.log`.
- `pnpm dev:inngest`: manual worker. `pnpm db:migrate`: applies pending migrations.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: CI verification sequence.
- `pnpm launch:check`: validates deployment configuration before enabling paid usage.
- Use `rtk` for supported Git/search/build/test commands, as required by project guidance.
- Read relevant installed Next.js guides in `node_modules/next/dist/docs/` before writing Next.js code.

## Where to work

| Concern | Entry points |
| --- | --- |
| Public pages and theme | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/landing/` |
| Sign-in and onboarding | `src/lib/auth/`, `src/proxy.ts`, `src/app/login/`, `src/app/onboarding/`, `src/lib/server/onboarding.ts` |
| Dashboard and project grouping | `src/app/dashboard/page.tsx`, `src/components/dashboard/project-campaign-workspace.tsx`, `src/lib/server/project-storage.ts` |
| Studio orchestration | `src/app/studio/page.tsx`, `src/components/studio/studio-shell.tsx` |
| Brand, briefs, copy, visuals | `src/components/studio/brand-dna-panel.tsx`, `campaign-builder.tsx`, `channel-outputs.tsx`, `creative-workspace.tsx`, `mini-canva-editor.tsx` in the same directory |
| Editor state and job polling | `src/lib/studio/`, `src/lib/studio-flow.ts`, `src/lib/job-results.ts` |
| Shared schemas and types | `src/lib/contracts.ts` (Zod), `src/lib/channels.ts` |
| Website scan and brand enrichment | `src/lib/server/scanner.ts`, `src/lib/server/url-security.ts`, `src/lib/server/brand-intelligence.ts` |
| AI providers and V1 generation | `src/lib/server/campaign-generator.ts` |
| V2 generation | `src/lib/server/generation-v2/`; canvas mapping in `src/lib/generation-v2/` |
| Durable workflows | `src/inngest/client.ts`, `src/inngest/functions.ts`, `src/app/api/inngest/route.ts` |
| Database, workspace access | `src/lib/server/database.ts`, `src/lib/server/workspace-access.ts`, `migrations/` |
| Studio persistence | `src/app/api/studio/state/route.ts`, `src/lib/server/studio-state.ts` |
| Billing and quotas | `src/lib/server/paddle.ts`, `src/app/api/paddle/`, `src/lib/entitlements.ts`, `src/lib/pricing.ts`, `src/lib/usage-window.ts` |
| Uploads, capture, export | `src/lib/server/object-storage.ts`, `src/lib/server/browserless.ts`, `src/app/api/uploads/`, `src/app/api/exports/`, `src/app/render/[token]/`, `src/lib/launch-kit.ts` |
| Setup and operations | `README.md`, `.env.example`, `scripts/`, `.github/workflows/ci.yml` |

## Runtime relationships

- `StudioShell` owns the browser workflow. It queues scans and generation through
  `/api/jobs/scan` and `/api/jobs/generate`, polls `/api/jobs/[id]`, and resumes
  saved project/campaign jobs. Scanning also has a direct `/api/scan` path.
- Authenticated requests resolve server-side workspace context. Project and
  campaign reads/writes must remain scoped to that workspace.
- Inngest functions scan/enrich sites, generate campaigns, regenerate individual
  channels, export assets, clean up deleted private objects, and dispatch the job
  outbox. Jobs and outbox events persist in Postgres; usage is reserved atomically
  and released on failure. Generation requires an idempotency key.
- Export API and worker share `compositionImageUrls`: validate images used by
  the active canvas, not unused legacy mockups. Remote rendering needs a public
  app origin; localhost cannot receive Browserless requests.
- Project URL identity reuses projects; dashboard groups saved campaigns under
  their product. Migration `0027_project_url_identity.sql` implements this identity.
- Studio snapshots use database revision checks plus device-local fallback.
  Preserve conflict handling and saved work when providers or sync fail.
  The editor's own URL updates must not rehydrate an already loaded scope;
  that can race autosave and reset its expected revision.
- Server-rendered session reads use the SDK's read-only context; cookie updates
  belong to `/api/auth`. Calling the writable Next.js auth adapter during page
  rendering can throw when the provider refreshes or clears session cookies.
- Loading cues use the local `LoadingIndicator` and `CampaignLoader` components,
  with CSS motion gated by reduced-motion preferences. Thinking Orbs was removed.
  Queued website scans request a desktop preview through the existing authenticated,
  project-scoped `/api/capture` route. `ScanPanel` fills the viewport below the
  step bar with the website image and overlays a CSS sweep during scanning.
  Returning to Website shows the last scan's desktop preview, with project access
  restored on hydrated capture URLs. Preview requests use `preview=1` for a
  viewport-only capture; failed captures retain the normal controls.
  Browserless request filters use plain regex sources and short address-range
  patterns; tests match them with `String.match`, as the provider does.
  Website capture waits for DOM content and a short render settle rather than
  network idleness, so long-lived background requests do not stall previews.
- V1 remains default. `GENERATION_VERSION=v2` marks newly queued campaigns;
  stored campaign input selects the worker's version. V2 runs strategy, platform
  copy, design planning, and review with at most one rewrite, then checks claims.
  Reviewed V2 visual copy goes to `designCreativeComposition`: AI authors the
  actual canvas layers, geometry, hierarchy, and imagery. The former fixed
  plan-to-canvas composition and silent planner fallback have been removed.
  Durable V1/V2 generation includes and persists the provider-authored canvas;
  initial and resumed clients use that result. Selecting another direction runs
  custom AI design with that direction's copy. Provider validation preserves the
  reviewed headline/CTA, approved wording, verified image references, and brand
  palette. Null optional styles are omitted without changing layer geometry.
  Editor font sizes scale with canvas width to match export typography.
- AI routing and structured responses live in `campaign-generator.ts`. Provider
  priority: NVIDIA NIM -> OpenRouter -> Groq -> legacy OpenAI settings. OpenAI
  uses Responses; the other configured providers use Chat Completions.
  `AI_GENERATION_ENABLED=false` pauses AI generation/design/rewrite while scans
  retain local factual curation. Never substitute demo fixtures for failed paid work.
- Export jobs render a saved immutable revision via a short-lived random database
  token, capture PNG through Browserless, and assemble channel files/evidence into
  a launch kit. Private assets are served through authenticated routes.
- Plan limits are authoritative in `entitlements.ts`; catalog prices in
  `pricing.ts` and Paddle configuration. Keep quotas and billing-period logic in
  code. Webhook entitlement changes require matching configured price IDs.

## Invariants and verification

- Treat scraped content as untrusted data. Preserve source evidence and approved
  claim links through generation and export.
- Retain SSRF checks before requests and redirects, DNS validation, crawl limits,
  same-origin checks, request-body validation, and production rate limits.
- Uploads accept raster PNG/JPEG/WebP, decode and re-encode through Sharp, strip
  metadata, and reject SVG. Keep storage private.
- Paddle verifies raw webhook signatures and handles replay. Account deletion
  coordinates billing, jobs, and database lifecycle guards; inspect migration
  `0026_account_lifecycle_guards.sql` before changing this flow.
- Vitest tests sit beside implementation. CI runs lint, typecheck, tests, and
  build, with a disposable PostgreSQL 18 service for database integration tests.
  Locally, database integration tests skip without `TEST_POSTGRES_BIN` and a
  configured disposable localhost server. Live AI tests require explicit
  `RUN_LIVE_AI_TESTS=true`; they call providers. Check skips before claiming coverage.
  `creative-design.live.test.ts` exercises two public/synthetic design briefs and
  saves provider responses, canvas JSON, and HTML previews in ignored
  `output/custom-canvas/` for inspection. Passing unit tests does not establish
  visual quality; inspect real rendered results and provider quota failures.
- ESLint excludes generated `output/` files. Fallow can help identify unused code,
  but verify references first: README-invoked operator scripts and the Windows
  dev-service launcher are runtime entry points outside its import graph.
- Runtime service setup is documented in `README.md` and `.env.example`.
  Environment file presence does not prove services are working. Never put
  credentials, environment values, or customer data in this map.

## AI Design Studio (2026-10-25)

- `/studio/design` is an authenticated workspace alongside the existing launch
  studio. Its entry link is in `StudioHeader`; campaign generation stays intact.
- `src/lib/design-studio/document.ts` is the editable, validated source of truth
  for brand kits, raster asset references, slides, text/shape/SVG layers and
  incremental property patches. `renderDesignHtml` emits escaped HTML/CSS/SVG;
  model-authored scripts, raw markup and external asset URLs are not accepted.
- `src/lib/design-studio/fonts.ts` is the font catalog (Outfit, 21 self-hosted
  Fontsource families in `public/design-fonts`, four system fonts) and pairings.
  Layers support declarative gradients, textures, shadows, blur and blend modes;
  `designNodeStyle` is the only CSS compiler, shared by editor and renderer.
- `src/lib/server/design-studio/providers.ts` supplies capability-aware adapters
  for Hetzner, Z.AI, Gemini, Groq, Workers AI, OpenRouter and compatible hosts.
  Explicit `DESIGN_AI_PROVIDERS_JSON` or per-provider model capability arrays are
  required. Campaign aliases alone do not configure this registry. Credentials
  stay server-only; provider cooldowns/rolling request limits are process-local.
- `pipeline.ts` orchestrates brief, copy, art direction, coordinate planning,
  composition, actual screenshot review and targeted repairs. Vision critique
  can be unavailable/failed and never receives a fabricated score. Partial
  results publish only after successful rendering; successful decisions survive
  provider failures. Input, token and revision budgets bound work.
- `renderer.ts` uses Playwright Core with local Chromium or a dedicated CDP /
  Browserless service. Fresh contexts disable JavaScript, network, service
  workers and downloads. Trusted measurement code checks actual layout/fonts/
  asset decoding and unambiguous solid-background text contrast. Generated
  layouts can apply measured font fits and approved brand colors, then rerender;
  manual edits preserve unrelated styles. Fonts are embedded and traced into
  Next.js output. Rotated generated layer bounds are contained within the canvas.
- Migration `0028_ai_design_studio.sql` adds workspace-scoped documents, immutable
  versions, brand kits, jobs and AI usage events. Revision-checked saves and their
  snapshots are atomic. Enqueue/retry functions serialize workspace admission;
  existing account-deletion guards also cover design work. No direct browser
  grants are added to these RLS-enabled tables.
- `/api/design-studio` and its `jobs/[id]`, `assets`, and `export` routes handle
  workspace ownership, cancellation/retry, sanitized assets and PNG/HTML/JSON/ZIP
  exports. Revisions return 409 on conflict. Forged assets are decoded/validated
  before persistence; upload bytes are re-encoded with metadata removed.
  Rendered/HTML exports reuse existing paid export and watermark entitlements;
  JSON backups are available to all plans. Deterministic render errors block
  PNG/ZIP export with 422 until corrected.
- `jobs.ts` registers Inngest generation and one-minute queued-event recovery.
  Durable stage replay preserves completed work, attempt guards prevent stale
  completion writes, and persisted usage bounds automatic retries. Manual
  retries start a new attempt. Inngest global concurrency is four; per-workspace
  concurrency defaults to two and is configurable from one to eight.
- `src/components/design-studio/` provides the real DOM editor, properties,
  layers, pan/zoom, history, variants, brand kits and conversational refinements.
  Browser drafts are user-scoped. Background results update an untouched canvas;
  manual edits and dragging stop automatic replacement.
- Setup: `docs/design-studio.md`; full provider configuration:
  `docs/design-studio-providers.md`. Real browser tests opt in with
  `RUN_DESIGN_BROWSER_TESTS=true`; PostgreSQL WASM storage tests use
  `RUN_DESIGN_SQL_TESTS=true` and the ignored runtime described in the guide.
  Five real-provider examples opt in with `RUN_LIVE_AI_TESTS=true`. Screenshots,
  feedback and resumable test checkpoints go to ignored `output/design-studio/`.

## Local code index

`graphify-out/graph.json` is an ignored, machine-local navigation index. Query
with `graphify query "ExactSymbol" --budget 1500`; refresh stale source with
`graphify update . --no-cluster`. If absent, build code-only with
`graphify extract . --code-only --no-cluster --max-workers 2` after checking scope
and exclusions. Keep generated indexes uncommitted.

Graph relationships require source verification, especially dynamic calls and
SQL. The current local Graphify installation lacks `tree_sitter_sql`; inspect
migrations directly for schema/function relationships. Historical audit/research
documents in `docs/` provide background, not current runtime verification.
