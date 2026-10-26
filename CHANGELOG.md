# Changelog


## Operations screens (PR #4)
- New screens: Scheduling (heuristic vs first-available baseline, measured runtime, accept), Technicians, Customers, Assets (PM overdue + service history), Service Agreements (calendars, contract SLA exceptions), Financials (invoice generation, payments; invoiced kept separate from cash), Automation Center (preview → approve/decline → receipts).
- Work orders: real "New work order" intake (Zod-validated, agreement-derived SLA), triage/approval transitions, cancellation with confirmation, invoice from closed job, status filters, pagination.
- Overview: region filter, KPI drill-downs, first-time-fix chart now computed from closed jobs (was static), dispatch timeline positioned by real times.
- Scenario Lab uses `proposeRecovery` for all six scenarios. Inventory and Activity gained search/filters and detail.

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

### Session hardening & seed realism (PR #2)
- Strict Zod schemas for every persisted entity (unknown keys rejected, integer cents enforced), schema v2 with v1→v2 migration, 5 MB size limit, post-parse referential integrity check, compact scenario baseline storage, and a visible notice when saved state is rejected or migrated.
- Seed: 80 open work orders (was 18), fictional human technician/contact names, 120 unique customer names, 3 business calendars, 120 service agreements, 920 reconciled historical invoices.
- Header search now filters work orders; decorative header buttons and the unwired dispatch button removed.

### Planning, SLA calendars, finance, automation domain (PR #3)
- `sla.ts`: business-hours calendars (working days, hours, holidays, IANA zone), `addBusinessMinutes`, `businessMinutesBetween`, contract SLA from the governing agreement.
- `planning.ts`: deterministic scheduler over the ready queue with a naive first-available baseline for comparison; recovery proposals for all six scenarios (parts shortage records a purchase request, never invents stock).
- `finance.ts`: invoice generation and payment recording in integer cents; invoiced, cash received, outstanding, and overdue kept separate.
- `automation.ts`: three deterministic rules with PROPOSE → PREVIEW → APPROVE → EXECUTE → RECEIPT, idempotent by proposal key, stale-trigger check, and declines recorded.
