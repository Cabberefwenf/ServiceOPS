# Testing strategy

- Unit: transitions, availability, recommendations, inventory, financials, KPIs, SLA states, seed integrity, and scenarios.
- Integration: assignment changes schedule and status; part usage changes inventory; closure recognizes revenue and updates customer/asset history through shared records.
- Browser: launch/reset, inspect urgent job, approve recommendation, reserve part, complete lifecycle, run/reset callout scenario, mobile navigation, and blocked transition feedback.

Run all non-browser checks with `npm run verify`. Run browser checks with `npm run test:e2e`; Playwright starts the local application automatically.
- Recovery: technician callout produces a deterministic, explainable reassignment plan; integrity checker asserts no orphans, overlaps, or negative/over-reserved stock.
- Browser (added): work-order intake, KPI drill-down and region filter, batch scheduling vs baseline, automation preview/approve, invoice + payment, guided tour, and portfolio screenshots loading. The mobile project skips desktop-only flows.
- Accessibility: `tests/e2e/accessibility.spec.ts` runs axe-core (WCAG 2.0/2.1 A and AA tags) on all 15 views, the open mobile navigation and the guided tour; also checks tour focus management and reduced-motion CSS.
- Deployed check: `PLAYWRIGHT_BASE_URL=https://serviceops-phi.vercel.app npx playwright test` runs the same suite against production.
