import { describe, expect, it } from "vitest";
import { calculateMetrics } from "./metrics";
import {
  assignWorkOrder,
  availableQuantity,
  createScenario,
  recommendTechnicians,
  reserveRequiredParts,
  transitionWorkOrder,
} from "./operations";
import { createSeedState } from "./seed";

describe("deterministic seed integrity", () => {
  it("creates the target-sized, referentially valid synthetic operating company", () => {
    const state = createSeedState();
    expect(state.customers).toHaveLength(120);
    expect(state.locations).toHaveLength(200);
    expect(state.assets).toHaveLength(480);
    expect(state.technicians).toHaveLength(42);
    expect(state.workOrders).toHaveLength(1000);
    expect(state.inventory).toHaveLength(320);
    const customerIds = new Set(state.customers.map((item) => item.id));
    const locationIds = new Set(state.locations.map((item) => item.id));
    const assetIds = new Set(state.assets.map((item) => item.id));
    for (const location of state.locations) expect(customerIds.has(location.customerId)).toBe(true);
    for (const asset of state.assets) {
      expect(customerIds.has(asset.customerId)).toBe(true);
      expect(locationIds.has(asset.locationId)).toBe(true);
    }
    for (const order of state.workOrders) {
      expect(customerIds.has(order.customerId)).toBe(true);
      expect(locationIds.has(order.locationId)).toBe(true);
      expect(assetIds.has(order.assetId)).toBe(true);
    }
  });
});

describe("dispatch recommendation and work execution", () => {
  it("recommends the feasible qualified technician and explains rejected alternatives", () => {
    const recommendations = recommendTechnicians(createSeedState(), "WO-10483");
    expect(recommendations[0]).toMatchObject({
      technicianId: "T-104",
      feasible: true,
      travelMinutes: 22,
    });
    expect(recommendations.find((item) => item.technicianId === "T-107")?.blockers).toContain(
      "Missing certification: EPA 608",
    );
    expect(recommendations.find((item) => item.technicianId === "T-102")?.blockers).toContain(
      "Conflicts with an existing assignment",
    );
  });

  it("blocks dispatch without a reservation and prevents double reservation", () => {
    const seed = createSeedState();
    const assigned = assignWorkOrder(seed, "WO-10483", "T-104");
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    const blocked = transitionWorkOrder(assigned.state, "WO-10483", "DISPATCHED");
    expect(blocked).toEqual({ ok: false, error: "Dispatch blocked: reserve every required part first." });
    const reserved = reserveRequiredParts(assigned.state, "WO-10483");
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const relay = reserved.state.inventory.find((item) => item.sku === "CR-440");
    expect(relay && availableQuantity(relay)).toBe(1);
    expect(reserveRequiredParts(reserved.state, "WO-10483")).toEqual({
      ok: false,
      error: "CR-440 is already reserved for this work order.",
    });
  });

  it("completes the validated lifecycle, consumes stock, and reconciles financials", () => {
    let state = createSeedState();
    const assigned = assignWorkOrder(state, "WO-10483", "T-104");
    if (!assigned.ok) throw new Error(assigned.error);
    state = assigned.state;
    const reserved = reserveRequiredParts(state, "WO-10483");
    if (!reserved.ok) throw new Error(reserved.error);
    state = reserved.state;
    for (const target of ["DISPATCHED", "IN_PROGRESS", "WORK_COMPLETED", "QUALITY_REVIEW", "CLOSED"] as const) {
      const result = transitionWorkOrder(state, "WO-10483", target);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const order = state.workOrders.find((item) => item.id === "WO-10483");
    const relay = state.inventory.find((item) => item.sku === "CR-440");
    expect(order?.status).toBe("CLOSED");
    expect(order?.consumedParts).toHaveLength(1);
    expect(relay?.onHand).toBe(1);
    expect(relay?.reservedBy["WO-10483"]).toBeUndefined();
    expect(order?.financials.partsCostCents).toBe(8_900);
    expect(order?.financials.partsChargeCents).toBe(14_900);
    expect(order?.financials.recognizedRevenueCents).toBe(57_400);
    expect(order?.financials.invoiceStatus).toBe("ELIGIBLE");
    expect(calculateMetrics(state).recognizedRevenueCents).toBeGreaterThan(0);
    expect(state.audit[0]?.detail).toBe("Quality Review → Closed.");
  });
});

describe("scenario isolation", () => {
  it("applies and compares technician callout without mutating canonical state", () => {
    const canonical = createSeedState();
    const originalAssignments = canonical.technicians.find((item) => item.id === "T-104")?.assignments.length;
    const scenario = createScenario(canonical, "technician-callout");
    expect(scenario.impactedWorkOrderIds).toEqual(["WO-10470", "WO-10476"]);
    expect(scenario.simulated.technicians.find((item) => item.id === "T-104")?.assignments).toHaveLength(0);
    expect(canonical.technicians.find((item) => item.id === "T-104")?.assignments).toHaveLength(originalAssignments ?? 0);
  });

  it("produces deterministic demand-spike pressure", () => {
    const canonical = createSeedState();
    const scenario = createScenario(canonical, "regional-demand-spike");
    expect(scenario.impactedWorkOrderIds).toHaveLength(12);
    expect(calculateMetrics(scenario.simulated).openWorkOrders - calculateMetrics(canonical).openWorkOrders).toBe(12);
  });
});
