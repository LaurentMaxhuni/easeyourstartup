# EaseYourStartup

EaseYourStartup is a revenue-first launch campaign SaaS for solo founders.
It scans a public product site, creates an editable and source-linked Brand DNA
profile, generates channel-native launch copy, keeps real screenshots inside
editable visual templates, exports a campaign package, and can publish approved
assets in a supporter room.

The working promise is: **Turn every ship into a campaign.**

## What works in this repository

- URL-first landing page, pricing, email/password and Google sign-in, launch studio, and
  authenticated supporter room
- SSRF-aware scanning with validation before the first request and every
  redirect
- Same-domain crawl of the homepage plus up to five linked pages
- Editable Brand DNA and claim approval ledger with source URLs
- Initial launch, feature update, milestone, waitlist, promotion, and custom
  campaign briefs
- Channel-specific copy for X, LinkedIn, Product Hunt, Reddit, Hacker News,
  Instagram, Threads, Facebook, and email
- Structured OpenAI Responses API output when configured, including whole-canvas
  AI design for editable layouts, layers, styling, and approved image assets
- Deterministic source-backed fallback when OpenAI is not configured
- Raster screenshot upload with MIME limits, decode and re-encode, metadata
  stripping, and SVG rejection
- Browser, phone, launch card, and split visual templates at 1:1, 4:5, 16:9,
  and 1.91:1
- Watermarked PNG preview and campaign ZIP export
- Stripe Checkout, customer portal, signature-verified webhooks, and replay
  protection
- Neon Postgres schema with workspace scoping and atomic usage consumption
- Neon Auth email/password and Google sign-in with server-side session validation
- Inngest workflows for resumable scan and generation jobs
- Authenticated job APIs for queueing scans and campaigns and polling progress
- HMAC-signed internal render pages for deterministic Browserless exports
- System light and dark themes, keyboard focus, responsive layouts, and
  reduced-motion support

The app has a deterministic demo fallback for AI and browser capture, but
authentication is required for the demo, live scan, generation, images, and
exports. Live AI, browser capture, database persistence, billing, and durable
jobs activate when their environment variables are present.

## Local setup

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `.env.local`.
3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Run the app:

   ```bash
   pnpm dev
   ```

5. Open `http://localhost:3000`, choose **Free scan**, and sign in with email
   and password or Google. The studio and scan APIs require an authenticated
   session.

## Service configuration

### OpenAI

Set an AI provider key. The studio requires a successful provider response and
never substitutes a local campaign or canvas when AI fails. `OPENAI_MODEL`
defaults to `gpt-5.6-terra`. Generation uses a structured output contract.
OpenAI uses the Responses API; Groq- and OpenRouter-compatible providers use
Chat Completions JSON mode. Only approved website claims and the
founder-provided update are allowed as factual sources.
For Groq, you can use the Groq key in `OPENAI_API_KEY`; a `gsk_` key is
auto-routed to Groq, or set `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
explicitly. When no model is supplied for Groq, the app uses
`openai/gpt-oss-120b`. You can also use `GROQ_API_KEY`, `GROQ_BASE_URL`, and
`GROQ_MODEL` directly; those aliases take precedence over the `OPENAI_*`
values. OpenRouter is supported with `OPENROUTER_API_KEY`,
`OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, and
`OPENROUTER_MODEL=openrouter/free`. OpenRouter documents `openrouter/free` as
a router over its currently available free models; free access still has
provider rate limits and availability can change. The visual editor's **AI design** tool calls
`POST /api/ai/design` to generate a validated, editable composition plus
separate HTML, CSS, and JavaScript. It can choose the layout, layers, colors,
crop, graphic treatment, and copy while mapping image layers back to approved
uploaded assets. Generated code is editable and previewed only inside a
sandboxed, network-isolated iframe. The focused **AI rewrite** tool calls
`POST /api/ai/rewrite` for one selected text layer.

### Browserless

Set `BROWSERLESS_API_URL` and `BROWSERLESS_API_KEY`. Captures use managed
browser sessions after the URL has passed the local public-destination checks.
Production deployments should also enable provider-level network egress rules.

### Neon Postgres + Neon Auth

Create a Neon project, enable Neon Auth on the target branch, and set
`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEXT_PUBLIC_NEON_AUTH_URL`, and
`NEON_AUTH_COOKIE_SECRET` from `.env.example`. The cookie secret must be at
least 32 characters long.

Run the application migrations after Neon Auth is enabled:

```bash
psql "$DATABASE_URL" -f migrations/0001_initial_schema.sql
psql "$DATABASE_URL" -f migrations/0002_studio_states.sql
```

Enable the email/password and Google providers in the Neon Auth settings.
Neon Auth owns the `neon_auth` schema; the migration references `neon_auth."user"` and keeps
product data in `public`. The first authenticated server request provisions a
default workspace and membership for that user. Workspace authorization is
enforced in the server-side queries before any user-scoped data is returned.

### Stripe

Create one recurring price and set `STRIPE_PRO_PRICE_ID`,
`STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. Send subscription events to:

```text
/api/stripe/webhook
```

Recommended events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### Inngest

Set the Inngest event and signing keys. The Next.js handler is available at
`/api/inngest`. Scan and campaign generation functions use idempotent steps and
persist progress in `jobs`.

Authenticated production clients can queue work with:

```text
POST /api/jobs/scan
POST /api/jobs/generate
GET  /api/jobs/{id}
```

Send an `Idempotency-Key` header when the client has a stable operation ID.

### Deterministic server rendering

Set `RENDER_SIGNING_SECRET` to at least 32 random bytes. The render-token API
requires an authenticated user and issues a five-minute HMAC-signed internal
render URL. Browserless can capture that page at the exact output dimensions.

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

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
- Billing webhooks verify the raw request body and Stripe signature.
- Workspace authorization is backed by server-side Neon queries rather than
  client state.
- The included in-memory rate limiter is suitable for local and single-instance
  previews. Replace it with a shared store such as Redis before horizontally
  scaling production traffic.

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
