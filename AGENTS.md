# ServiceOPS engineering guidance

- Preserve the synthetic, local-first demo boundary. Core workflows must never require credentials, a database, or a paid provider.
- Put business rules in `src/domain`; UI components may dispatch domain commands but must not duplicate transition, scheduling, inventory, SLA, or financial rules.
- Every state-changing command must be atomic and append an audit event.
- Use integer minor units for money and ISO timestamps for events.
- Keep generated data deterministic and relationally valid.
- Do not add a navigation destination without a working, useful view.
- Run `npm run verify` plus representative Playwright flows before release claims.
- Do not add a license until the owner chooses one.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
