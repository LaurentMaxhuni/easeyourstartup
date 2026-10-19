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
- V1 remains default. `GENERATION_VERSION=v2` marks newly queued campaigns;
  stored campaign input selects the worker's version. V2 runs strategy, platform
  copy, design planning, and review with at most one rewrite, then checks claims.
  Initial and resumed generation map the reviewed V2 design plan into the canvas
  through `resolveGeneratedCreativeDesign`, avoiding a redundant AI design call.
  Canvas mapping flows text by content length, adapts to aspect ratio, and uses
  abstract brand artwork when no real screenshot is supplied. Editor font sizes
  scale with canvas width to match export typography; avoid screen-pixel floors.
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
- ESLint excludes generated `output/` files. Fallow can help identify unused code,
  but verify references first: README-invoked operator scripts and the Windows
  dev-service launcher are runtime entry points outside its import graph.
- Runtime service setup is documented in `README.md` and `.env.example`.
  Environment file presence does not prove services are working. Never put
  credentials, environment values, or customer data in this map.

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
