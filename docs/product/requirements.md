# Product requirements — initial release

ServiceOPS is a browser-based field-service operations command platform. The initial production slice must let a visitor understand the environment quickly, inspect an urgent failure, receive an explainable feasible assignment, preview and approve it, reserve and consume a required part, move the job through valid lifecycle states, observe operational and financial effects, simulate a technician callout, compare the impact, and reset safely.

## Initial release scope

- Overview with state-derived KPIs, attention queue, dispatch schedule, performance trend, and activity history.
- Work-order table and detail workspace with guarded lifecycle commands.
- Deterministic recommendation scoring with hard skill, certification, availability, shift, overlap, appointment, and parts constraints.
- Inventory reservation/release/consumption with non-negative stock invariants.
- Job economics in integer cents; taxes and cash collection are explicitly not modeled.
- Isolated technician-callout scenario with before/after metrics and canonical reset.
- Synthetic disclosure, portfolio entry, responsive navigation, keyboard operation, durable local demo sessions, and audit history.

## Deferred after the vertical slice

Full CRUD depth for every requested module, advanced optimization beyond a deterministic feasible heuristic, optional provider-backed assistant, and authenticated commercial operation are intentionally deferred and must not be misrepresented as complete.
