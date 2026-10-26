# ADR-002: Continue the existing implementation incrementally

Status: Accepted — 2026-10-26

## Context

Directive 001 stated that `Cabberefwenf/ServiceOPS` was empty. Re-verification on 2026-10-26 found that this is
no longer true: `main` contained two commits (`6a32497`, `6db6ac2`) with a working Next.js 16 / React 19 / strict
TypeScript application, domain modules in `src/domain`, 6 Vitest tests, 3 Playwright flows, and documentation.
Only `main` exists on the remote. ADR-001's statement that the repository was empty described the state before
those commits.

Baseline verification on the unmodified checkout (Node 20.19.2 on the agent box): lint passed, typecheck passed,
Vitest 6/6 passed, `next build` succeeded, Playwright 3 passed / 3 skipped (project-specific skips).

## Decision

Keep the existing stack and domain model and improve it incrementally on feature branches. A rewrite would discard
working, tested behaviour without benefit. ADR-001 decisions stand, including plain CSS custom properties instead of
Tailwind (Tailwind is not added just to match the directive's default list).

The audit found these gaps, addressed on `feat/serviceops-foundation`:

- Completion data was hard-coded (`actualLaborMinutes = estimate + 12`, fixed notes for every job). Completion now
  requires a Zod-validated record (labor minutes, resolution code, notes); labor cost derives from entered minutes.
- The work-order detail drawer had three tab buttons with no behaviour (dead-end controls). They were removed.
- The recommendation card always displayed "Part ready". It now reflects actual parts availability.
- The technician-callout scenario identified impacted jobs but proposed no alternatives and was fixed to T-104.
  The scenario now accepts any scheduled technician and produces a deterministic, explainable greedy recovery plan
  that can be accepted into scenario state only.
- Recommendation parts readiness ignored the job's own reservation; fixed.
- Cancelling a scheduled job left its schedule block on the technician; fixed.
- No whole-state integrity check existed; `checkIntegrity` now verifies referential integrity, overlapping
  assignments and stock invariants, and is exercised in tests.
