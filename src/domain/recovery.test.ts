import { describe, expect, it } from "vitest";
import {
  assignWorkOrder,
  checkIntegrity,
  createScenario,
  proposeReassignments,
  reserveRequiredParts,
  transitionWorkOrder,
} from "./operations";
import { createSeedState } from "./seed";

function readyToStart() {
  let state = createSeedState();
  const assigned = assignWorkOrder(state, "WO-10483", "T-104");
  if (!assigned.ok) throw new Error(assigned.error);
  const reserved = reserveRequiredParts(assigned.state, "WO-10483");
  if (!reserved.ok) throw new Error(reserved.error);
  state = reserved.state;
  for (const target of ["DISPATCHED", "IN_PROGRESS"] as const) {
    const result = transitionWorkOrder(state, "WO-10483", target);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe("state integrity", () => {
  it("seed has no orphan relationships, overlapping assignments, or negative stock", () => {
    expect(checkIntegrity(createSeedState())).toEqual([]);
  });

  it("detects a reservation that exceeds on-hand stock", () => {
    const state = createSeedState();
    const item = state.inventory[0]!;
    item.reservedBy["WO-10483"] = item.onHand + 1;
    expect(checkIntegrity(state).some((issue) => issue.problem === "reserved exceeds on-hand")).toBe(true);
  });
});

describe("completion record", () => {
  it("rejects completion without a validated record and leaves stock untouched", () => {
    const state = readyToStart();
    const result = transitionWorkOrder(state, "WO-10483", "WORK_COMPLETED");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Completion record required/);
    const short = transitionWorkOrder(state, "WO-10483", "WORK_COMPLETED", {
      actualLaborMinutes: 0,
      completionNotes: "short",
      resolutionCode: "REPAIRED",
    });
    expect(short.ok).toBe(false);
    expect(state.inventory.find((item) => item.sku === "CR-440")?.reservedBy["WO-10483"]).toBe(1);
  });

  it("uses entered labor minutes for labor cost and records first response at start", () => {
    const state = readyToStart();
    const order = state.workOrders.find((item) => item.id === "WO-10483");
    expect(order?.firstRespondedAt).toBeDefined();
    const done = transitionWorkOrder(state, "WO-10483", "WORK_COMPLETED", {
      actualLaborMinutes: 90,
      completionNotes: "Replaced relay, verified chiller restart.",
      resolutionCode: "REPLACED_COMPONENT",
    });
    if (!done.ok) throw new Error(done.error);
    const tech = done.state.technicians.find((item) => item.id === "T-104")!;
    const completed = done.state.workOrders.find((item) => item.id === "WO-10483")!;
    expect(completed.actualLaborMinutes).toBe(90);
    expect(completed.financials.laborCostCents).toBe(Math.round(1.5 * tech.laborCostRateCents));
    expect(checkIntegrity(done.state)).toEqual([]);
  });

  it("cancelling a scheduled job releases reservations and the schedule block", () => {
    const assigned = assignWorkOrder(createSeedState(), "WO-10483", "T-104");
    if (!assigned.ok) throw new Error(assigned.error);
    const reserved = reserveRequiredParts(assigned.state, "WO-10483");
    if (!reserved.ok) throw new Error(reserved.error);
    const cancelled = transitionWorkOrder(reserved.state, "WO-10483", "CANCELLED");
    if (!cancelled.ok) throw new Error(cancelled.error);
    expect(cancelled.state.inventory.find((item) => item.sku === "CR-440")?.reservedBy["WO-10483"]).toBeUndefined();
    expect(
      cancelled.state.technicians.find((item) => item.id === "T-104")?.assignments.some((a) => a.workOrderId === "WO-10483"),
    ).toBe(false);
  });
});

describe("technician callout recovery", () => {
  it("proposes feasible, non-conflicting reassignments without touching canonical state", () => {
    const canonical = createSeedState();
    const scenario = createScenario(canonical, "technician-callout");
    const plan = proposeReassignments(scenario.simulated, scenario.impactedWorkOrderIds);
    expect(plan.proposals.map((proposal) => proposal.workOrderId).sort()).toEqual(
      [...scenario.impactedWorkOrderIds].sort(),
    );
    for (const proposal of plan.proposals) {
      expect(proposal.explanation.length).toBeGreaterThan(10);
      if (proposal.feasible) expect(proposal.technicianId).not.toBe("T-104");
    }
    expect(checkIntegrity(plan.resultingState)).toEqual([]);
    expect(canonical.technicians.find((item) => item.id === "T-104")?.status).not.toBe("UNAVAILABLE");
    // Deterministic: running twice yields identical proposals.
    expect(proposeReassignments(scenario.simulated, scenario.impactedWorkOrderIds).proposals).toEqual(plan.proposals);
  });

  it("supports choosing which technician calls out", () => {
    const canonical = createSeedState();
    const busy = canonical.technicians.find((item) => item.id !== "T-104" && item.assignments.length > 0)!;
    const scenario = createScenario(canonical, "technician-callout", { technicianId: busy.id });
    expect(scenario.affectedTechnicianId).toBe(busy.id);
    expect(scenario.impactedWorkOrderIds).toEqual(busy.assignments.map((a) => a.workOrderId));
  });
});
