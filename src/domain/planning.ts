import { appendAudit, assignWorkOrder, clone, priorityRank, proposeReassignments, recommendTechnicians, availableQuantity } from "./operations";
import type { ReassignmentPlan } from "./operations";
import type { OperationalState, ScenarioState, WorkOrder } from "./types";

export interface PlanSummary {
  considered: number;
  assigned: number;
  criticalAssigned: number;
  criticalTotal: number;
  unassigned: number;
  totalTravelMinutes: number;
}

function summarize(state: OperationalState, plan: ReassignmentPlan): PlanSummary {
  const assigned = plan.proposals.filter((proposal) => proposal.feasible);
  const critical = plan.proposals.filter((proposal) => proposal.priority === "CRITICAL");
  void state;
  return {
    considered: plan.proposals.length,
    assigned: assigned.length,
    criticalAssigned: critical.filter((proposal) => proposal.feasible).length,
    criticalTotal: critical.length,
    unassigned: plan.proposals.length - assigned.length,
    totalTravelMinutes: assigned.reduce((sum, proposal) => sum + (proposal.travelMinutes ?? 0), 0),
  };
}

/**
 * Baseline for comparison: jobs in id order, each given the first feasible technician by id.
 * This represents a naive "first available" dispatcher, with no priority or travel ranking.
 */
export function baselineSchedule(state: OperationalState, workOrderIds: string[]): ReassignmentPlan {
  let working = clone(state);
  const proposals: ReassignmentPlan["proposals"] = [];
  for (const id of [...workOrderIds].sort()) {
    const order = working.workOrders.find((item) => item.id === id);
    if (!order) continue;
    const first = recommendTechnicians(working, id)
      .filter((candidate) => candidate.feasible)
      .sort((a, b) => a.technicianId.localeCompare(b.technicianId))[0];
    const result = first && order.status === "READY_TO_SCHEDULE" ? assignWorkOrder(working, id, first.technicianId) : undefined;
    if (first && result?.ok) {
      working = result.state;
      proposals.push({ workOrderId: id, priority: order.priority, feasible: true, technicianId: first.technicianId, technicianName: first.technicianName, travelMinutes: first.travelMinutes, explanation: "First feasible technician by id." });
    } else proposals.push({ workOrderId: id, priority: order.priority, feasible: false, explanation: "No feasible technician remained." });
  }
  return { proposals, resultingState: working };
}

export interface ScheduleRun {
  heuristic: ReassignmentPlan;
  baseline: ReassignmentPlan;
  heuristicSummary: PlanSummary;
  baselineSummary: PlanSummary;
  workOrderIds: string[];
}

/** Deterministic schedule for every READY_TO_SCHEDULE job. Nothing is applied until the caller accepts `heuristic.resultingState`. */
export function runScheduler(state: OperationalState): ScheduleRun {
  const workOrderIds = state.workOrders.filter((order) => order.status === "READY_TO_SCHEDULE").map((order) => order.id);
  const heuristic = proposeReassignments(state, workOrderIds);
  const baseline = baselineSchedule(state, workOrderIds);
  return { heuristic, baseline, heuristicSummary: summarize(state, heuristic), baselineSummary: summarize(state, baseline), workOrderIds };
}

export interface RecoveryStep {
  workOrderId: string;
  feasible: boolean;
  action: string;
  explanation: string;
}

export interface RecoveryPlan {
  method: string;
  steps: RecoveryStep[];
  resultingState: OperationalState;
}

function fromReassignment(plan: ReassignmentPlan, method: string): RecoveryPlan {
  return {
    method,
    steps: plan.proposals.map((proposal) => ({
      workOrderId: proposal.workOrderId,
      feasible: proposal.feasible,
      action: proposal.feasible ? `Reassign → ${proposal.technicianName} (${proposal.technicianId})` : "Unresolved",
      explanation: proposal.explanation,
    })),
    resultingState: plan.resultingState,
  };
}

function partsRecovery(scenario: ScenarioState): RecoveryPlan {
  const working = clone(scenario.simulated);
  const orders = scenario.impactedWorkOrderIds
    .map((id) => working.workOrders.find((order) => order.id === id))
    .filter((order): order is WorkOrder => Boolean(order))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.id.localeCompare(b.id));
  const steps: RecoveryStep[] = [];
  let shortfall = 0;
  for (const order of orders) {
    const covered = order.requiredParts.every((part) => {
      const item = working.inventory.find((candidate) => candidate.sku === part.sku);
      return (item?.reservedBy[order.id] ?? 0) >= part.quantity;
    });
    if (covered) {
      steps.push({ workOrderId: order.id, feasible: true, action: "Keep", explanation: "Parts already reserved; dispatch can proceed." });
      continue;
    }
    shortfall += order.requiredParts.reduce((sum, part) => sum + part.quantity, 0);
    steps.push({ workOrderId: order.id, feasible: true, action: "Hold dispatch", explanation: `${order.priority} job stays blocked by the dispatch parts check until stock is received.` });
  }
  const item = working.inventory.find((candidate) => candidate.sku === "CR-440");
  if (item && shortfall > 0) {
    const quantity = shortfall + item.reorderPoint - Math.max(0, availableQuantity(item));
    appendAudit(working, item.sku, "PURCHASE_REQUEST_CREATED", `Expedited purchase request for ${quantity} × ${item.sku} (covers ${shortfall} held job unit(s) plus reorder point). Stock is unchanged until receipt.`, "Scenario Lab");
    steps.push({ workOrderId: item.sku, feasible: true, action: `Request ${quantity} units`, explanation: "Purchase request recorded; no stock is invented." });
  }
  return { method: "Priority-ordered hold and expedite (deterministic rule set)", steps, resultingState: working };
}

/** A recovery proposal for any of the six scenarios. Applied only after explicit acceptance. */
export function proposeRecovery(scenario: ScenarioState): RecoveryPlan {
  const state = scenario.simulated;
  switch (scenario.id) {
    case "critical-parts-shortage":
      return partsRecovery(scenario);
    case "fleet-efficiency": {
      const ids = state.workOrders.filter((order) => order.status === "READY_TO_SCHEDULE").map((order) => order.id);
      return fromReassignment(proposeReassignments(state, ids), "Greedy feasible heuristic over the full ready queue with the staged fleet");
    }
    default:
      return fromReassignment(proposeReassignments(state, scenario.impactedWorkOrderIds), "Greedy feasible heuristic (priority → SLA due → id), not a proven optimum");
  }
}
