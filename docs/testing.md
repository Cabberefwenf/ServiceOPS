# Testing strategy

- Unit: transitions, availability, recommendations, inventory, financials, KPIs, SLA states, seed integrity, and scenarios.
- Integration: assignment changes schedule and status; part usage changes inventory; closure recognizes revenue and updates customer/asset history through shared records.
- Browser: launch/reset, inspect urgent job, approve recommendation, reserve part, complete lifecycle, run/reset callout scenario, mobile navigation, and blocked transition feedback.

Run all non-browser checks with `npm run verify`. Run browser checks with `npm run test:e2e`; Playwright starts the local application automatically.
