# Repository audit — 6 October 2026

Audited commit: `ef3c055` (`checkpoint-current-working-app`). No application fixes applied.

**Found 11 significant defects: eight P1 issues and three P2 issues.** P1 means a core operation fails, quota becomes unrecoverable, or an application safety boundary can be bypassed. P2 means a narrower correctness or verification failure. These findings are supported by executable probes, isolated PostgreSQL experiments, or an observed check failure; they are not a guarantee that every defect has been found.

## Findings

### 1. P1 — Fresh database setup cannot complete

[Initial identity columns](C:/github-projects/easeyourstartup/migrations/0001_initial_schema.sql:20) reference Neon Auth IDs as `text`; [stored asset ownership](C:/github-projects/easeyourstartup/migrations/0009_private_stored_assets.sql:4) references the same IDs as `uuid`. Later account-deletion and test-grant tables also require UUID IDs. Migration 0021 changes a provisioning function, not these column types or foreign keys.

**Reproduction:** Created two isolated PostgreSQL 18.3 databases, each with a minimal `neon_auth."user"` table, then applied repository migrations in order. With `id uuid`, migration 0001 fails: `Key columns "owner_user_id" ... and "id" ... are of incompatible types: text and uuid.` With `id text`, migrations 0001–0008 apply, then 0009 fails with the inverse mismatch. Neither identity type supports the migration chain as written.

**Impact:** New deployments and database recovery from migrations are blocked. Existing manually repaired deployments may behave differently; their actual schema was not inspected.

**Fix:** Choose the authoritative Neon identity type, align all referencing columns and functions, and test the complete chain against an empty database. Provide a safe forward migration for existing installations.

### 2. P1 — Image uploads insert text into a UUID ownership column

[Upload persistence](C:/github-projects/easeyourstartup/src/app/api/uploads/route.ts:89) explicitly casts the authenticated user ID to `text`, while migration 0009 declares `stored_assets.owner_user_id uuid`.

**Reproduction:** Executed the same typed INSERT expression against a UUID ownership column in isolated PostgreSQL: `column "owner_user_id" is of type uuid but expression is of type text`. This happens after the object has been uploaded; the handler then attempts to delete that object and returns an error.

**Impact:** Screenshots cannot be saved on the declared asset schema, even after the storage-signature defect below is fixed. Paid exports require these saved assets.

**Fix:** Use the selected identity type consistently. Also inspect explicit text comparisons such as [onboarding ownership](C:/github-projects/easeyourstartup/src/app/api/onboarding/route.ts:80): PostgreSQL rejects `uuid = text` if that installation uses UUID workspace ownership.

### 3. P1 — All private-storage signatures use an invalid canonical request

[Header authentication](C:/github-projects/easeyourstartup/src/lib/server/object-storage.ts:55) omits the terminating newline in its canonical headers. [Presigned reads](C:/github-projects/easeyourstartup/src/lib/server/object-storage.ts:125) make the same mistake. Joining request fields with a newline does not supply the additional separation required after canonical headers by the [AWS SigV4 specification](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html).

**Reproduction:** Called the actual storage functions with dummy credentials. Independently reconstructed the expected signatures from the outgoing headers and generated URL. Both signatures differ from the correct result and exactly match the reconstruction with the required newline removed. No real storage credentials or remote writes were used.

**Impact:** A conforming S3 service rejects uploads, reads, deletes, and export-image URLs. This blocks asset persistence and paid exports, and prevents physical object cleanup.

**Fix:** Correct canonical-header termination in both signers, or use a maintained signer already available to the project. Add independent signature vectors and a storage integration test.

### 4. P1 — Channel regeneration fails, including its failure cleanup

[Success persistence](C:/github-projects/easeyourstartup/src/inngest/functions.ts:326) and [failure cleanup](C:/github-projects/easeyourstartup/src/inngest/functions.ts:273) call `pg_catalog.greatest(...)`. PostgreSQL's `GREATEST` is a conditional expression, not a schema-qualified ordinary function. Migration 0020 repairs this mistake in campaign usage functions but leaves these worker queries unchanged.

**Reproduction:** Isolated PostgreSQL returns `function pg_catalog.greatest(integer, integer) does not exist`; unqualified `greatest(1, 0)` succeeds. Both worker paths contain that exact invalid expression.

**Impact:** Regenerated copy cannot be committed. The failure callback also aborts before marking the job failed or releasing its channel reservation. The stale-job sweeper releases campaign reservations, not channel reservations, so it does not repair that allowance.

**Fix:** Correct both expressions and release the appropriate reservation when stale regeneration jobs fail. Make replacement persistence, counter changes, and job completion atomic.

### 5. P1 — Account deletion safety checks can be bypassed

[Auth proxy POST](C:/github-projects/easeyourstartup/src/app/api/auth/[...path]/route.ts:80) forwards directly to Neon Auth. Billing, shared-workspace, checkout, and background-job checks occur only in the separate preparation endpoint. [The account UI](C:/github-projects/easeyourstartup/src/components/account/account-settings-client.tsx:72) calls preparation before `authClient.deleteUser`, but the actual deletion endpoint does not enforce that preparation.

**Reproduction:** Invoked the exported auth POST handler with `/api/auth/delete-user` and a mocked upstream handler. The deletion request reaches upstream and returns 200 without any application database or lifecycle check. This verifies the missing application gate, not a live Neon account deletion.

**Impact:** Where Neon deletion is enabled as documented, an authenticated account can bypass the app's subscription/job restrictions by requesting deletion directly. Foreign-key cascades can remove the local billing mapping while an external subscription remains active. Confirmation callbacks also need protection; browser ordering cannot enforce a server invariant.

**Fix:** Enforce lifecycle checks at the deletion boundary, including provider confirmation paths, and prevent new conflicting work while deletion is pending. Validate provider configuration without performing deletion on a real customer.

### 6. P1 — Deleting a project during generation strands campaign quota

[Project DELETE](C:/github-projects/easeyourstartup/src/app/api/projects/[id]/route.ts:151) deletes the project without rejecting or releasing in-flight generation reservations. Project deletion cascades into campaigns and jobs; workspace usage counters survive.

**Reproduction:** Used the repository's campaign/job foreign keys and usage-release function in isolated PostgreSQL. Seeded a queued campaign with one reserved allowance, executed the equivalent project-deletion CTE, then called `release_campaign_usage_reservation`. Result: zero campaigns, zero jobs, and `reserved_campaigns = 1`. The release function cannot locate the deleted campaign and the stale sweeper cannot locate the deleted job.

**Impact:** A free workspace can lose its only campaign allowance for the rest of the period without receiving a campaign. Paid workspaces can also strand allowances.

**Fix:** Reject deletion while work is active, or atomically cancel work and release outstanding reservations before cascades remove their owning rows. Preserve historical completed usage.

### 7. P1 — An expired export stops the entire private-object cleanup worker

[Expiry cleanup](C:/github-projects/easeyourstartup/src/inngest/functions.ts:551) clears `object_key` and then returns that updated column. The returned value is therefore null, which it inserts into the cleanup queue's non-null primary key.

**Reproduction:** Ran the same UPDATE/INSERT CTE against isolated tables with one expired export. PostgreSQL reports `null value in column "object_key" ... violates not-null constraint`. The statement rolls back: the expired key remains, and no cleanup is queued.

**Impact:** Once an export expires, the worker fails at its first step. Later steps for deleted assets, expired render tokens, and deletion locks are also skipped on subsequent runs while the expired export remains.

**Fix:** Capture old object keys before clearing metadata, then queue them atomically. Test expiry using at least one actual expired row.

### 8. P1 — Former subscribers cannot purchase Pro again

[Checkout claim conditions](C:/github-projects/easeyourstartup/src/app/api/paddle/checkout/route.ts:126) allow replacing only failed or expired pending/creating attempts. A completed attempt can never be replaced. [The next branch](C:/github-projects/easeyourstartup/src/app/api/paddle/checkout/route.ts:154) returns “Payment is being confirmed” for that completed attempt indefinitely, even when the subscription check has already found no active subscription.

**Reproduction:** Invoked the actual route with no active subscription, no deletion request, and an old completed attempt. It returns 409 and never calls Paddle. Source inspection establishes that expiry cannot make a completed attempt reclaimable.

**Impact:** Cancellation followed by a return to the product permanently blocks checkout for that workspace without operator intervention.

**Fix:** Permit a fresh attempt after the previous subscription has ended while retaining duplicate-payment protection during current confirmation.

### 9. P2 — Paid fallback exports contain a free-preview watermark

[Render selection](C:/github-projects/easeyourstartup/src/components/render-composition.tsx:420) selects the legacy renderer whenever a composition lacks AI provenance and stored elements. [That renderer](C:/github-projects/easeyourstartup/src/components/render-composition.tsx:671) always adds “Free preview.” The paid render page passes no entitlement/watermark option. Generation's fallback direction clears elements and AI provenance, so this is a reachable state when automatic design is unavailable and no subsequent editor change materializes layers.

**Reproduction:** Server-rendered the actual component with a valid composition and no AI provenance or stored elements. The resulting markup contains `Free preview`.

**Impact:** A paid customer can receive a watermarked visual despite Pro promising unwatermarked exports. The fallback export renderer also differs from the editor's generated layer representation.

**Fix:** Use the same renderer and materialized layer representation for preview and export; derive watermark behavior from the trusted export context.

### 10. P2 — Broken images are accepted as successful exports

[Readiness signal](C:/github-projects/easeyourstartup/src/components/render-readiness-signal.tsx:18) suppresses image decode failures, then sets `renderReady = true`. Browserless waits for that readiness flag.

**Reproduction:** Ran the actual readiness effect against a document with a rejected image decode. It still marks the document ready.

**Impact:** Unavailable images, expired read URLs, or storage delivery failures can produce incomplete PNGs/ZIPs marked completed. A later retry is not triggered by the missing screenshot.

**Fix:** Require successful loading of visible export images, expose a render failure state, and propagate that failure to the export job.

### 11. P2 — Repository CI fails on vendored video code

[ESLint ignores](C:/github-projects/easeyourstartup/eslint.config.mjs:8) omit `videos/**/assets/vendor/**`. Root `eslint .` applies TypeScript rules to vendored GSAP. [CI runs this command](C:/github-projects/easeyourstartup/.github/workflows/ci.yml:23) before typecheck, tests, and build.

**Observed:** Lint exits 1 with eight `@typescript-eslint/no-this-alias` errors and 191 warnings in `videos/ease-your-startup/assets/vendor/gsap.min.js`.

**Impact:** The committed verification workflow is red before later checks run, obscuring regressions and preventing a clean release gate.

**Fix:** Exclude vendored distributions from application linting and verify the separate video project with its own configured checks.

## Evidence and verification

- Existing suite: **38 test files, 223 tests passed**.
- TypeScript: **passed**.
- Production build: **passed**, Next.js 16.2.12.
- Lint: **failed**, eight errors and 191 warnings in vendored GSAP.
- Temporary audit suite: **seven probes passed**, meaning they reproduced the defective behavior; they do not demonstrate fixes.
- PostgreSQL 18.3: fresh-migration failures reproduced for both auth identity types; invalid regeneration expression, upload identity cast, expiry cleanup failure, and stranded quota reproduced locally.

The installed binaries were invoked directly (`node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, and `node node_modules/next/dist/bin/next build`). The `pnpm` wrapper could not fetch its pinned package-manager executable because sandbox networking was blocked. Direct invocation completed the applicable checks without changing dependencies.

Audit probes were retained outside the repository at [audit-probes.test.ts](C:/Users/STORM/.codex/visualizations/2026/10/06/01a111c1-7cea-79b1-bfc7-677fe2813367/audit-probes.test.ts). They use dummy credentials and mocked service boundaries. Re-running their PostgreSQL probe requires a disposable local server on port 55439; the audit server was stopped after verification. Copy the probe into the repository only for a temporary run, then remove it; its assertions describe existing defects rather than desired regression behavior.

## Verification gaps and residual risk

Review concentrated on authentication, workspace authorization, billing/webhooks, scanner destination checks, upload/storage, durable jobs/outbox, quota accounting, editor persistence, export rendering, migration compatibility, and CI. Marketing presentation and video animation were not exhaustively reviewed. Source-backed authorization checks were inspected; no cross-workspace data access exploit was established.

No production database, real billing checkout, live deletion, AI generation request, or storage write was performed. Provider-side Neon deletion restrictions and Browserless network egress settings remain unverified. Browserless also requires destination confirmation headers that need checking against the actual deployed provider's response contract.

Dependency vulnerability lookup could not complete: the network-enabled execution host fails before running commands because its PowerShell configuration resides in an unavailable OneDrive file. No claim of vulnerability-free dependencies is made.

Two further source-level concerns need targeted follow-up after the P1 blockers: regeneration saves replacement/counters and job completion in separate statements, so a failure between them may consume another reservation on retry; completed campaigns without a saved editor snapshot are not reconstructed from stored outputs by the studio-loading path. Neither was validated against a running end-to-end application, so neither is counted among the eleven findings.

Fix order: identity schema and runtime casts; storage signatures; server deletion boundary and quota-safe deletion; regeneration and expiry cleanup; repeat checkout; render correctness; CI. Follow fixes with empty-database migration tests and sandbox end-to-end tests that scan, generate, upload, export, cancel, and repurchase.
