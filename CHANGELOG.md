# Changelog

## Unreleased — feat/serviceops-foundation

- Completion requires a validated record (actual labor minutes, resolution code, notes); labor cost uses entered minutes.
- `firstRespondedAt` is recorded when work starts if not already set.
- Cancelling a job releases its reservations and its technician schedule block.
- Technician-callout scenario: selectable technician, deterministic greedy recovery plan with explanations and unresolved reasons, accept-into-scenario action.
- `checkIntegrity` domain function and tests for referential integrity, overlaps, and stock invariants.
- Removed non-functional detail tabs; recommendation card no longer claims parts are ready when they are not.
- ADR-002 records the repository audit and the incremental-continuation decision.

## 0.1.0 — 2026-10-26

- Bootstrap local-first ServiceOPS architecture, verified synthetic domain model, command-center UI, workflow tests, and deployment documentation.
- Publish the verified public demonstration at <https://serviceops-phi.vercel.app/>.
