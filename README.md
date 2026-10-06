# EaseYourStartup

EaseYourStartup is a revenue-first launch campaign SaaS for solo founders.
It scans a public product site, creates an editable and source-linked Brand DNA
profile, generates channel-native launch copy, keeps real screenshots inside
editable visual templates, and exports a source-backed launch kit.

The working promise is: **Turn every ship into a campaign.**

## What works in this repository

- URL-first landing page, pricing, email/password and Google sign-in, and launch studio
- SSRF-aware scanning with validation before the first request and every
  redirect
- Same-domain crawl of the homepage plus up to five linked pages
- Automatically curated Brand DNA with source URLs and source-backed facts
- Initial launch, feature update, milestone, waitlist, promotion, and custom
  campaign briefs
- Channel-specific copy for X, LinkedIn, Product Hunt, Reddit, Hacker News,
  Instagram, Threads, Facebook, and email
- Opt-in Generation V2 with AI brand interpretation, campaign strategy,
  platform-specific copy, bounded design planning, and one critic-guided rewrite
- Structured visual plans mapped to the existing editable campaign canvas
- Provider failures preserve saved work and return a recoverable error
- Raster screenshot upload with MIME limits, decode and re-encode, metadata
  stripping, and SVG rejection
- Browser, phone, launch card, and split visual templates at 1:1, 4:5, 16:9,
  and 1.91:1
- Free watermarked visual previews, with unwatermarked PNG and full launch-kit
  exports on Pro
- Pro launch-kit exports with separate channel files, source evidence,
  a launch brief, and a creative PNG
- Paddle Checkout, customer portal, signature-verified webhooks, and replay
  protection
- Neon Postgres schema with workspace scoping and atomic usage consumption
- Neon Auth email/password and Google sign-in with server-side session validation
- Inngest workflows for resumable scan and generation jobs
- Authenticated job APIs for queueing scans and campaigns and polling progress
- Atomic campaign-slot reservations so concurrent generation requests respect
  workspace plan limits
- Short-lived, random database tokens for deterministic Browserless exports
- System light and dark themes, keyboard focus, responsive layouts, and
  reduced-motion support

The paid launch flow requires configured AI, scan, background-job, database,
and billing services. Provider failures are surfaced and saved work remains
available for retry. Deterministic example data is retained as test fixture data.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`.
3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Run the app in one terminal:

   ```bash
   pnpm dev
   ```

5. Run the local Inngest worker in a second terminal:

   ```bash
   pnpm dev:inngest
   ```

6. Open `http://localhost:3000`, sign in with email/password or Google, then
   scan a public product URL. Open **Dashboard** to see the saved project.

## Service configuration

### OpenAI

Set an AI provider key for campaign copy and creative direction. If the provider
is unavailable or returns malformed output, the campaign is reported as failed,
the previous saved output remains intact, and its quota reservation is released.
`OPENAI_MODEL` defaults to
`gpt-5.6-terra`. Generation uses strict structured output contracts. OpenAI
uses the Responses API; Groq, NVIDIA NIM, and OpenRouter use
Chat Completions. OpenRouter adds JSON schema routing and response healing.
Only automatically curated website facts and the founder-provided update are
allowed as factual sources.
Set `AI_GENERATION_ENABLED=false` to pause campaign generation, AI design, and
AI rewrites across the app. Website scans continue with local factual curation
while the switch is off.
For Groq, you can use the Groq key in `OPENAI_API_KEY`; a `gsk_` key is
auto-routed to Groq, or set `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
explicitly. When no model is supplied for Groq, the app uses
`openai/gpt-oss-120b`. You can also use `GROQ_API_KEY`, `GROQ_BASE_URL`, and
`GROQ_MODEL` directly; those aliases take precedence over the `OPENAI_*`
values. OpenRouter is supported with `OPENROUTER_API_KEY`,
`OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, and
`OPENROUTER_MODEL=openrouter/free`. OpenRouter documents `openrouter/free` as
a router over its currently available free models; free access still has
provider rate limits and availability can change.

NVIDIA NIM uses `NVIDIA_NIM_API_KEY` and `NVIDIA_NIM_MODEL`; its base URL
defaults to `https://integrate.api.nvidia.com/v1` and can be overridden with
`NVIDIA_NIM_BASE_URL` for a self-hosted NIM. Set a model ID from the NVIDIA NIM
catalog, or use the served model ID from `/v1/models` for self-hosted NIM. For
image-based brand analysis, configure `NVIDIA_NIM_BRAND_VISION_MODEL` with an
image-capable model. NVIDIA NIM takes priority when multiple keys are set,
followed by OpenRouter, Groq, then the legacy `OPENAI_*` settings.

Campaign generation stays on the existing V1 flow by default. Set
`GENERATION_VERSION=v2` to queue new campaigns through Generation V2; each
V2 campaign stores a version marker, so existing and already queued campaigns
keep using V1. V2 runs structured strategy, separate platform copy,
design planning, and quality review, with at most one rewrite. It uses the
existing editor and stores its strategy, design plan, and review with the job
result. No schema migration is required.

Task-specific model overrides use `OPENROUTER_BRAND_VISION_MODEL`,
`OPENROUTER_BRAND_TEXT_MODEL`, `OPENROUTER_STRATEGY_MODEL`,
`OPENROUTER_COPY_MODEL`, `OPENROUTER_DESIGN_PLANNER_MODEL`, and
`OPENROUTER_CRITIC_MODEL`. `AI_<TASK>_MODEL` provides a provider-neutral
fallback override; equivalent `GROQ_<TASK>_MODEL` and `OPENAI_<TASK>_MODEL`
names are supported. Set `OPENROUTER_FALLBACK_MODELS` to a comma-separated list
of backup model IDs; it defaults to `openrouter/free`. After OpenRouter reports
its daily free-model limit, remaining free fallbacks are skipped and the job
fails without retrying the exhausted quota; set a model your account can access
to continue generation immediately.
NVIDIA NIM supports the same task suffixes through `NVIDIA_NIM_<TASK>_MODEL`.

The visual editor's **AI design** tool calls
`POST /api/ai/design` to return one validated, editable visual plan. The AI
chooses the layout, hierarchy, copy, crop, graphic treatment, and selected
image assets. React renders the plan through the editor's fixed components and
brand tokens; the Spec view shows the validated plan and Preview uses that same
renderer. Model-authored HTML, CSS, and JavaScript are not generated or run.
The focused **AI rewrite** tool calls `POST /api/ai/rewrite` for one selected
text layer.

### Browserless

Set `BROWSERLESS_API_URL` and `BROWSERLESS_API_KEY`. Captures use managed
browser sessions after the URL has passed the local public-destination checks.
Production deployments must enable provider-level network egress rules to block
non-public IP destinations after redirects and DNS changes; Browserless request
filters and response checks provide an additional layer.

### Private object storage

Configure an S3-compatible bucket with private access and set `S3_ENDPOINT`,
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
Uploaded images are resized to WebP and served through authenticated workspace
routes; they are not returned as base64 snapshots.

### Neon Postgres + Neon Auth

Create a Neon project, enable Neon Auth on the target branch, and set
`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEXT_PUBLIC_NEON_AUTH_URL`, and
`NEON_AUTH_COOKIE_SECRET` from `.env.example`. The cookie secret must be at
least 32 characters long.

Run application migrations after Neon Auth is enabled. The runner records
applied files in `public.app_schema_migrations`, applies pending files in order,
and detects migrations already present in a database that used the older manual
instructions. Use a migration-capable database role for this operator command;
the application runtime needs only its normal data permissions.

```bash
pnpm db:migrate
```

Application foreign keys use the UUID IDs in `neon_auth."user"`. Migration 0024
repairs legacy text ownership columns without deleting data; incompatible IDs
cause the migration transaction to roll back. Legacy studio snapshot keys remain text.
The PostgreSQL integration suite requires `TEST_POSTGRES_BIN` pointing to the
directory containing `psql`, plus a disposable server on localhost (port 55439,
role `audit` by default; override with `TEST_POSTGRES_PORT` and `TEST_POSTGRES_USER`).
Run `pnpm test -- src/lib/server/migrations.test.ts`; it creates and drops only
randomly named test databases. Without this configuration, integration tests skip.

For local feature QA, set `EASEYOURSTARTUP_TEST_MODE=true` and grant an
account temporary Pro access with:

```bash
pnpm test:grant-pro -- founder@example.com 7
```

The operator command grants that account's existing workspace for 1–30 days
(seven by default). Test grants are available only when the app URL is localhost,
test mode is explicitly enabled, and the server is not running in production.
They never create Paddle subscriptions or charges.

Enable the email/password and Google providers in the Neon Auth settings, plus
the `delete-user` endpoint so account deletion can complete after its billing
and background-job safety checks pass. Configure and verify email templates and
OAuth callbacks before inviting customers.
Neon Auth owns the `neon_auth` schema; the migration references `neon_auth."user"` and keeps
product data in `public`. The first authenticated server request provisions a
default workspace and membership for that user. Workspace authorization is
enforced in the server-side queries before any user-scoped data is returned.

### Paddle Billing

Create one recurring Paddle product and price. Set `PADDLE_ENVIRONMENT` to
`sandbox` or `production`, then configure `PADDLE_PRO_PRICE_ID`,
`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and the matching public client token
in `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`. Set `NEXT_PUBLIC_PADDLE_ENVIRONMENT`
to the same environment. The default Paddle payment link must use `/checkout`,
which loads Paddle.js and opens the transaction passed in the payment URL.
Send subscription events to:

```text
/api/paddle/webhook
```

Recommended events:

- `transaction.completed`
- `subscription.created`
- `subscription.updated`
- `subscription.activated`
- `subscription.trialing`
- `subscription.past_due`
- `subscription.paused`
- `subscription.canceled`

Paddle Billing does not automatically migrate existing Stripe customers. Any
existing Stripe subscription is retained as legacy data and must be replaced
by a new Paddle subscription.

For the founding offer, create a separate recurring $19 price and set
`PADDLE_FOUNDING_PRICE_ID`. After approving a founder, assign a numbered slot
to their workspace with the operator command:

```bash
pnpm founding:assign <workspace-uuid>
```

The command returns the existing assignment for that workspace, assigns at
most one of the ten slots, and reports when all slots are allocated. A
founding slot is counted once its subscription activates; cancellation ends
eligibility for later purchases.

Pro and founding entitlements are granted only when the webhook price ID matches
one of the configured Paddle price IDs. Use Paddle sandbox prices and a separate
sandbox webhook secret for staging; production credentials and prices must not
be shared with staging.

### Inngest

For local development, set `INNGEST_DEV=1` and run `pnpm dev:inngest` alongside
`pnpm dev`. The local Inngest Dev Server syncs the Next.js handler at
`/api/inngest` and runs scheduled outbox dispatch. Set production event and
signing keys in deployed environments. Scan and campaign generation functions use idempotent steps and
persist progress in `jobs`. The scheduled private-object cleanup retries
deletions queued when a customer removes an asset or project. Scan,
generation, channel-regeneration, and export jobs are inserted with a transactional
outbox event; the scheduled dispatcher retries delivery with a stable event ID
and releases reserved usage if an event cannot be delivered after repeated
attempts.

Authenticated production clients can queue work with:

```text
POST /api/jobs/scan
POST /api/jobs/generate
GET  /api/jobs/{id}
```

Send an `Idempotency-Key` header when the client has a stable operation ID.

### Deterministic server rendering

Exports render an immutable saved campaign revision through a short-lived,
random database token. The composition itself is never embedded in a URL.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm launch:check
```

Set `DEPLOYMENT_ENVIRONMENT` to `staging` or `production` in the deployment
environment and run `pnpm launch:check` before enabling paid usage. It verifies
that required integrations exist, secrets meet minimum lengths, public origins
use HTTPS, and staging uses Paddle sandbox while production uses live Paddle.

## Security notes

- Scanner destinations are restricted to HTTP and HTTPS on standard web ports.
- Localhost, private, loopback, link-local, metadata, reserved, and
  documentation IP ranges are rejected.
- DNS results are checked before each request and redirect.
- Crawls limit page count, redirects, response size, and execution time.
- Scraped text is supplied to generation as untrusted data, never as model
  instructions.
- Uploads accept PNG, JPEG, and WebP only and are decoded and re-encoded with
  Sharp.
- Billing webhooks verify the raw request body and Paddle signature.
- Workspace authorization is backed by server-side Neon queries rather than
  client state.
- Production rate limits are stored in Postgres and fail closed when the shared
  limiter is unavailable; local development can use the process-local fallback.

## Product boundary

The current product does not publish to social platforms, capture authenticated
sites, generate video, redesign websites, provide agency white-labeling, or
implement team approvals. Those remain intentionally deferred until customer
demand proves the need.

## Generated project asset

`public/images/founder-launch-studio.png` was created with the built-in image
generation tool using this final brief:

> A candid editorial image of an independent software founder arranging launch
> materials at a practical off-white and graphite studio desk, with one cobalt
> accent, no readable text, no invented interface, and no watermark.
