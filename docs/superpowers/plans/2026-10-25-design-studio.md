# AI Design Studio Implementation Plan

**Goal:** Implement the supplied creative brief → direction → plan → editable composition → isolated render → critique → targeted revision workflow alongside the campaign studio.

**Architecture:** Reuse Next.js authentication, Neon workspace isolation, Inngest durable steps, Zod validation, private uploads, and existing visual identity. A bounded editable document model compiles to HTML/CSS/SVG; generated scripts and external URLs are not accepted. Preserve the existing campaign studio.

**Specification:** [User-supplied request](../specs/2026-10-25-design-studio-request.md), 2026-10-25.

## Constraints

- Use pnpm; no image-generation models. All assets remain editable web compositions.
- Server-only credentials and capability-aware providers; real screenshots and explicit vision availability.
- Workspace-scoped records, optimistic revisions, persistent jobs, cancellation and recovery.
- Default up to three revision rounds; enforce a configurable token budget and concurrency.
- Preserve unrelated layers on edits; failures never replace the last working document.

## Tasks

- [x] Define validated document, brand kit, page, asset and incremental patch schemas; test escaping, unsafe resources and preservation.
- [x] Implement six provider adapters and optional compatible endpoints, model registry, bounded retries, fallback, streaming, usage and safe settings output. Test failure and capability routing.
- [x] Implement isolated Chromium rendering, embedded fonts, blocked network, deterministic diagnostics and PNG capture. Verify real screenshots, dimensions and malicious content.
- [x] Implement multi-stage generation and targeted refinements with schema repair, budget enforcement, reference analysis, stage checkpoints and vision critique.
- [x] Add Neon persistence, optimistic document revisions, brand memory, request telemetry, scoped jobs, retry/cancel and durable Inngest execution.
- [x] Add an authenticated responsive workspace: brief, conversation, variants/slides, live editable canvas, properties/layers, history, assets, brand kits and providers.
- [x] Integrate API routes, navigation and PNG/HTML/JSON export; document provider and renderer configuration.
- [x] Run lint, typecheck, unit/integration suite, production build and browser examples; record actual coverage and external-service limitations in `docs/design-studio.md`.

## Review focus

Validate cross-workspace access, cancellation during a model call, competing saves, insufficient context/output budgets, unavailable vision, renderer egress and output dimensions. Exercise five requested briefs and carousel pages with real browser captures. Provider credentials are environment configuration; settings never return secrets.
