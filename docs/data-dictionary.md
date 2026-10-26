# Synthetic data dictionary

The deterministic generator in `src/domain/seed.ts` creates 120 customers, 200 locations, 480 assets, 42 technicians, 1,000 work orders, and 320 inventory SKUs from a fixed seed. All names, addresses, identifiers, serial numbers, contacts, operations, and financial records are fictional.

| Entity | Stable key | Important relationships |
| --- | --- | --- |
| Customer | `C-####` | owns locations and assets; referenced by work orders |
| Service location | `L-####` | belongs to a customer; has a service region |
| Asset | `A-#####` | belongs to a customer and location |
| Technician | `T-###` | owns non-overlapping assignment records |
| Work order | `WO-#####` | references customer, location, asset, optional technician, and parts |
| Inventory item | SKU | tracks on-hand and per-work-order reservations |
| Service agreement | `AG-####` | belongs to a customer; tier and business calendar drive contract SLA |
| Invoice | `INV-#####` | generated from a closed work order; carries payments |
| Automation rule / receipt | rule id | threshold rule; each approve/decline writes a receipt and audit event |
| Audit event | `EV-#####` | records actor, time, entity, command type, and receipt detail |

Money is integer cents. Time is stored as ISO 8601 and displayed in the demo's Eastern time context. Available stock is always `onHand − sum(reservedBy)`. Persisted demo sessions use schema version 2 (version 1 sessions are migrated on load; invalid or tampered state is rejected).
