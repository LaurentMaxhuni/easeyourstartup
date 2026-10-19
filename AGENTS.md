# Repository instructions

- Commit each meaningful change after it is complete, using a concise message that describes the change.

## Persistent repository context

- At the start of work in this repository, read `docs/codebase-map.md` for product context, code entry points, and verification commands. Inspect the repo before asking the user to explain it.
- Keep that map current when a meaningful change affects architecture, workflows, integrations, or commands. Record durable facts and decisions; never credentials or customer data.
- Verify relevant source before editing; the map and local Graphify index are navigation aids, not substitutes for current code. Do not repeat a full repository survey for routine tasks.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
