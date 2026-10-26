# ADR-001: Local-first Next.js demonstration architecture

Status: Accepted — 2026-10-26

## Context

ServiceOPS must demonstrate operationally credible field-service workflows in a public browser without authentication, a live database, paid APIs, or hidden infrastructure. The source repository was verified empty through both the local checkout and the authorized GitHub connection.

## Decision

- Next.js 16 App Router with React 19 and strict TypeScript provides a deployable shell, route metadata, static/server rendering, and a clean path to future server-backed features.
- Domain entities, state transitions, scheduling, reservations, SLA calculations, financial calculations, and scenario simulation are framework-independent TypeScript modules.
- A deterministic seed generator builds the synthetic Northstar Industrial Service Group dataset. The client persists a versioned session snapshot in `localStorage` when available and falls back to memory when storage is blocked.
- Zod validates persisted snapshots and imported boundaries. State-changing commands return explicit failures and append audit records.
- CSS custom properties and component-scoped classes implement the approved visual system. This intentionally avoids a utility-CSS dependency while preserving exact palette and density control.
- Vitest covers domain rules; Playwright verifies browser workflows. No real external integration is required for core behavior.

## Consequences

The public demo is cheap, deterministic, resettable, and Vercel-compatible. Browser persistence is convenience, not authorization. A future backend can replace the repository/persistence adapter without rewriting domain rules. The initial vertical slice prioritizes the complete work-order-to-dispatch-to-inventory-to-financial workflow and technician-callout scenario; later phases can expand route depth without changing the model.
