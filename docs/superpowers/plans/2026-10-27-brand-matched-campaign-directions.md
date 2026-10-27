# Brand-matched campaign directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Offer three editable, website-matched concepts before generating a campaign and carry the chosen concept into the result.

**Architecture:** Extend the existing durable design pipeline with an opt-in per-direction message mode. Persist pre-campaign design references and job state in the studio draft, then associate the selected saved design with the campaign while passing its approved message into campaign generation. Reuse the existing design editor, asset validation, renderer, and workspace authorization.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Neon Postgres, Inngest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-brand-matched-campaign-directions-design.md`

## Global Constraints

- Preserve existing campaigns, generation behavior, workspace isolation, user edits, and optimistic save conflicts.
- Never invent claims or logos. Do not require a specific AI provider.
- Show real editable previews; treat website style extraction as an inference.

## Review Focus

- Reload or interrupted jobs retain successful concepts and selected revisions.
- Failed or partially generated concepts do not discard completed work.
- Brief or brand changes mark concepts stale without deleting edits.
- Missing visual reference or provider failure produces a clear recovery path.
- The generated campaign and export use the selected edited message and design.

### Task 1: Independent concepts

**Files:** `src/lib/design-studio/workflow.ts`, `src/lib/server/design-studio/pipeline.ts`, corresponding tests.

- [ ] Add an opt-in generation mode that produces a separate evidence-grounded message per direction; preserve default behavior.
- [ ] Test distinct per-direction messages, composition inputs, and existing shared-copy behavior. Run focused Vitest tests.

### Task 2: Draft persistence and campaign association

**Files:** `src/lib/contracts.ts`, `src/lib/studio/`, `src/components/studio/studio-shell.tsx`, relevant API and storage tests.

- [ ] Persist job, concept references, selected revision and source fingerprint with backward-compatible state validation.
- [ ] Carry the chosen approved message into generation and attach its saved design to the resulting campaign, including resume and conflict paths.
- [ ] Test older snapshots, changed inputs, refresh/resume, workspace access, and failed generation without losing edits.

### Task 3: Preview selection and editing

**Files:** `src/components/studio/`, `src/components/design-studio/`, relevant browser tests.

- [ ] Add an accessible comparison step between announcement and generation. Queue three actual editable variants, show progress and failures, and preserve partial results.
- [ ] Open each concept in the existing larger editor; return to comparison with its saved edits. Allow selection and revisiting alternatives.
- [ ] Reuse sanitized website screenshot as visual reference and let users correct missing assets. Test keyboard operation, editing, stale state, and retry.

### Task 4: End-to-end verification

**Files:** `docs/codebase-map.md`, relevant existing tests.

- [ ] Verify the selected edited message reaches channel generation and the selected design reaches editing and export; exercise provider failure and refresh.
- [ ] Run focused tests, typecheck, lint and appropriate browser checks; evaluate real renders across contrasting websites when providers are configured.
- [ ] Update the codebase map and commit each completed meaningful change. Report any unavailable provider or browser verification honestly.
