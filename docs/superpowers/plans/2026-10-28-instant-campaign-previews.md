# Instant Campaign Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show three branded template previews immediately, with optional custom AI designs.

**Architecture:** Build three local DesignDocuments from the existing template catalog. Save through existing design storage, retain previous concepts, and run the existing AI workflow only on request. Keep ready designs usable while an independent AI job runs.

**Tech Stack:** Next.js 16.3, React 19, TypeScript, Vitest, Playwright Core.

**Spec:** `docs/superpowers/specs/2026-10-28-instant-campaign-previews-design.md`

## Global Constraints

- No new provider, paid service, dependency, or database migration is planned.
- Never invent marketing claims, metrics, or testimonials to fill a layout.
- Preserve saved AI concepts, history, revision conflict handling, and selected-message/design handoff.
- Subagents may use only GPT 6 Luna with max reasoning; no separate fast-mode control is exposed by the agent tool.

## Review Focus

- A template save fails after another succeeds: retain previews and reuse successful saves on retry.
- AI finishes after the founder selects or edits a template: preserve their selection and revision.
- Brief changes while old concepts exist: mark stale and refresh explicitly without dropping edits.
- Long copy and unavailable imagery: render readable, distinct eligible layouts without waiting on capture.
- A campaign generation job is pending: prevent selection changes and retain resume behavior.

### Task 1: Local template matching and editable documents

**Files:** Create `src/lib/design-studio/campaign-templates.ts` and `campaign-templates.test.ts`; refine `templates.ts` only if rendering exposes defects.

**Interfaces:** `campaignTemplateConcepts({ brand, draft, assets? }): { id: string; label: string; message: string; description: string; document: DesignDocument }[]`, consuming BrandProfile and StudioDraft; returns exactly three distinct layouts.

- [ ] Add tests for brand character, campaign kind, long copy, image eligibility, deterministic results, approved wording, and valid documents.
- [ ] Run targeted tests and verify expected failures before implementing matching and document construction.
- [ ] Implement local ranking and varied template selection using existing brand-kit, template, and document helpers.
- [ ] Render representative brands, correct visible layout problems, rerun targeted tests, and commit.

### Task 2: Default templates and optional AI

**Files:** Modify `src/components/studio/studio-shell.tsx`, `campaign-concepts.tsx`, their relevant tests, and `src/lib/studio/concepts.ts` / `concepts.test.ts`.

**Interfaces:** CampaignConcepts receives separate refresh-template and generate-AI callbacks. Ready cards remain interactive during an independent AI job; queued/partial/unsaved cards and pending campaign jobs stay protected.

- [ ] Add failing tests for template source fingerprints, ready-card controls during AI generation, independent AI action, and pending campaign protection.
- [ ] Build and display local previews before awaiting saves; save concurrently and reuse cached successful records on retry.
- [ ] Change announcement continuation to templates; wire optional AI generation, separate refresh/retry actions, and preserve selection on job completion.
- [ ] Verify persistence recovery and selected-design handoff with browser fixtures; rerun relevant tests and commit.

### Task 3: Verify and document the completed flow

**Files:** Update `docs/codebase-map.md`, this plan, and relevant browser tests.

- [ ] Inspect ready, saving, AI-loading, failure, stale, and campaign-pending states at narrow, medium, and wide widths; verify keyboard controls.
- [ ] Run lint, typecheck, unit suite, build, and relevant local browser/render tests; report opt-in skips accurately.
- [ ] Obtain one independent review using GPT 6 Luna/max, fix material findings with regression coverage, and commit.
- [ ] Record the new runtime flow and verification results; commit completed documentation.
