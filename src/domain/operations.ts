import type {
  InventoryItem,
  OperationalState,
  OperationResult,
  ScenarioState,
  Technician,
  WorkOrder,
  WorkOrderStatus,
} from "./types";

const transitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  REQUESTED: ["TRIAGED", "CANCELLED"],
  TRIAGED: ["APPROVED", "CANCELLED"],
  APPROVED: ["READY_TO_SCHEDULE", "CANCELLED"],
  READY_TO_SCHEDULE: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["DISPATCHED", "READY_TO_SCHEDULE", "CANCELLED"],
  DISPATCHED: ["IN_PROGRESS", "WAITING_FOR_PARTS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_PARTS", "WAITING_FOR_CUSTOMER", "WORK_COMPLETED"],
  WAITING_FOR_PARTS: ["READY_TO_SCHEDULE", "IN_PROGRESS", "CANCELLED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "CANCELLED"],
  WORK_COMPLETED: ["QUALITY_REVIEW"],
  QUALITY_REVIEW: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  CANCELLED: [],
};

function clone(state: OperationalState): OperationalState {
  return structuredClone(state);
}

function findOrder(state: OperationalState, id: string) {
  return state.workOrders.find((order) => order.id === id);
}

function reservedQuantity(item: InventoryItem) {
  return Object.values(item.reservedBy).reduce((total, quantity) => total + quantity, 0);
}

export function availableQuantity(item: InventoryItem) {
  return item.onHand - reservedQuantity(item);
}

function appendAudit(
  state: OperationalState,
  entityId: string,
  type: string,
  detail: string,
  actor = "Demo operator",
) {
  state.audit.unshift({
    id: `EV-${String(state.audit.length + 1).padStart(5, "0")}`,
    timestamp: state.now,
    actor,
    type,
    entityId,
    detail,
  });
}

function statusLabel(status: WorkOrderStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

export interface Recommendation {
  technicianId: string;
  technicianName: string;
  feasible: boolean;
  score: number;
  travelMinutes: number;
  reasons: string[];
  blockers: string[];
}

export function recommendTechnicians(
  state: OperationalState,
  workOrderId: string,
): Recommendation[] {
  const order = findOrder(state, workOrderId);
  if (!order) return [];
  const location = state.locations.find((item) => item.id === order.locationId);
  const start = Date.parse(order.appointmentStart);
  const end = start + order.estimatedDurationMinutes * 60_000;
  const partsReady = order.requiredParts.every((requirement) => {
    const item = state.inventory.find((candidate) => candidate.sku === requirement.sku);
    return item && availableQuantity(item) >= requirement.quantity;
  });

  return state.technicians
    .map((technician) => {
      const blockers: string[] = [];
      const reasons: string[] = [];
      const skillsMatch = order.requiredSkills.every((skill) => technician.skills.includes(skill));
      const certificationsMatch = order.requiredCertifications.every((certification) =>
        technician.certifications.includes(certification),
      );
      const withinShift = start >= Date.parse(technician.shiftStart) && end <= Date.parse(technician.shiftEnd);
      const conflict = technician.assignments.some((assignment) =>
        overlaps(start, end, Date.parse(assignment.start), Date.parse(assignment.end)),
      );
      if (!skillsMatch) blockers.push(`Missing required skill: ${order.requiredSkills.join(", ")}`);
      if (!certificationsMatch)
        blockers.push(`Missing certification: ${order.requiredCertifications.join(", ")}`);
      if (technician.status === "UNAVAILABLE" || technician.status === "LEAVE")
        blockers.push("Technician is unavailable");
      if (!withinShift) blockers.push("Appointment is outside the technician shift");
      if (conflict) blockers.push("Conflicts with an existing assignment");
      if (!partsReady) blockers.push("Required parts are not available");
      const sameRegion = technician.region === location?.region;
      const travelMinutes = sameRegion ? 18 + (Number(technician.id.slice(-1)) % 3) * 4 : 45;
      if (skillsMatch && certificationsMatch) reasons.push("Required qualification matches");
      if (withinShift && !conflict) reasons.push("Appointment window is available");
      if (sameRegion) reasons.push("Same service region");
      if (partsReady) reasons.push("Required part is ready");
      const score = 100 - blockers.length * 100 - travelMinutes - technician.assignments.length * 6;
      return {
        technicianId: technician.id,
        technicianName: technician.name,
        feasible: blockers.length === 0,
        score,
        travelMinutes,
        reasons,
        blockers,
      };
    })
    .sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
}

export function assignWorkOrder(
  state: OperationalState,
  workOrderId: string,
  technicianId: string,
): OperationResult {
  const recommendations = recommendTechnicians(state, workOrderId);
  const candidate = recommendations.find((item) => item.technicianId === technicianId);
  if (!candidate) return { ok: false, error: "Technician or work order was not found." };
  if (!candidate.feasible)
    return { ok: false, error: `Assignment blocked: ${candidate.blockers.join("; ")}.` };
  const next = clone(state);
  const order = findOrder(next, workOrderId);
  const technician = next.technicians.find((item) => item.id === technicianId);
  if (!order || !technician) return { ok: false, error: "Assignment target is no longer available." };
  if (order.status !== "READY_TO_SCHEDULE")
    return { ok: false, error: `Work order must be ready to schedule; current state is ${order.status}.` };
  const start = order.appointmentStart;
  const end = new Date(Date.parse(start) + order.estimatedDurationMinutes * 60_000).toISOString();
  order.assignedTechnicianId = technician.id;
  order.scheduledStart = start;
  order.status = "SCHEDULED";
  technician.assignments.push({ workOrderId, start, end });
  appendAudit(
    next,
    order.id,
    "ASSIGNMENT_APPROVED",
    `${technician.name} (${technician.id}) assigned for ${start}; estimated travel ${candidate.travelMinutes} minutes.`,
  );
  return { ok: true, state: next, message: `${technician.name} assigned and schedule updated.` };
}

export function reserveRequiredParts(state: OperationalState, workOrderId: string): OperationResult {
  const order = findOrder(state, workOrderId);
  if (!order) return { ok: false, error: "Work order was not found." };
  if (order.requiredParts.length === 0)
    return { ok: false, error: "This work order has no required parts." };
  for (const requirement of order.requiredParts) {
    const item = state.inventory.find((candidate) => candidate.sku === requirement.sku);
    if (!item) return { ok: false, error: `Required SKU ${requirement.sku} does not exist.` };
    const existing = item.reservedBy[workOrderId] ?? 0;
    if (existing === requirement.quantity)
      return { ok: false, error: `${requirement.sku} is already reserved for this work order.` };
    if (availableQuantity(item) + existing < requirement.quantity)
      return {
        ok: false,
        error: `${requirement.sku} shortage: ${availableQuantity(item)} available, ${requirement.quantity} required.`,
      };
  }
  const next = clone(state);
  for (const requirement of order.requiredParts) {
    const item = next.inventory.find((candidate) => candidate.sku === requirement.sku);
    if (item) item.reservedBy[workOrderId] = requirement.quantity;
  }
  appendAudit(next, workOrderId, "PARTS_RESERVED", "All required parts reserved atomically.");
  return { ok: true, state: next, message: "Required parts reserved." };
}

function hasRequiredReservations(state: OperationalState, order: WorkOrder) {
  return order.requiredParts.every((requirement) => {
    const item = state.inventory.find((candidate) => candidate.sku === requirement.sku);
    return (item?.reservedBy[order.id] ?? 0) >= requirement.quantity;
  });
}

function consumeReservations(state: OperationalState, order: WorkOrder) {
  for (const requirement of order.requiredParts) {
    const item = state.inventory.find((candidate) => candidate.sku === requirement.sku);
    if (!item) continue;
    const reserved = item.reservedBy[order.id] ?? 0;
    if (reserved < requirement.quantity || item.onHand < requirement.quantity)
      throw new Error(`Reservation invariant failed for ${item.sku}.`);
    item.onHand -= requirement.quantity;
    delete item.reservedBy[order.id];
    order.consumedParts.push({
      ...requirement,
      unitCostCents: item.unitCostCents,
      unitPriceCents: item.unitPriceCents,
    });
  }
  order.financials.partsCostCents = order.consumedParts.reduce(
    (sum, part) => sum + part.unitCostCents * part.quantity,
    0,
  );
  order.financials.partsChargeCents = order.consumedParts.reduce(
    (sum, part) => sum + part.unitPriceCents * part.quantity,
    0,
  );
}

function releaseReservations(state: OperationalState, workOrderId: string) {
  for (const item of state.inventory) delete item.reservedBy[workOrderId];
}

export function transitionWorkOrder(
  state: OperationalState,
  workOrderId: string,
  to: WorkOrderStatus,
): OperationResult {
  const source = findOrder(state, workOrderId);
  if (!source) return { ok: false, error: "Work order was not found." };
  if (!transitions[source.status].includes(to))
    return { ok: false, error: `Transition ${source.status} → ${to} is not permitted.` };
  if (to === "DISPATCHED" && !source.assignedTechnicianId)
    return { ok: false, error: "Dispatch blocked: assign a qualified technician first." };
  if (to === "DISPATCHED" && !hasRequiredReservations(state, source))
    return { ok: false, error: "Dispatch blocked: reserve every required part first." };

  const next = clone(state);
  const order = findOrder(next, workOrderId);
  if (!order) return { ok: false, error: "Work order was not found after validation." };
  order.status = to;
  if (to === "WORK_COMPLETED") {
    try {
      consumeReservations(next, order);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Parts could not be consumed." };
    }
    const technician = next.technicians.find((item) => item.id === order.assignedTechnicianId);
    order.actualLaborMinutes = order.estimatedDurationMinutes + 12;
    order.completedAt = next.now;
    order.visits += 1;
    order.resolutionCode = "REPAIRED";
    order.completionNotes = "Relay replaced, controls verified, and chiller returned to service.";
    if (technician) {
      order.financials.laborCostCents = Math.round(
        (order.actualLaborMinutes / 60) * technician.laborCostRateCents,
      );
    }
  }
  if (to === "CLOSED") {
    order.closedAt = next.now;
    order.financials.recognizedRevenueCents = Math.max(
      0,
      order.financials.billableLaborCents +
        order.financials.partsChargeCents +
        order.financials.travelChargeCents -
        order.financials.discountCents,
    );
    order.financials.invoiceStatus = "ELIGIBLE";
  }
  if (to === "CANCELLED") releaseReservations(next, order.id);
  appendAudit(next, order.id, "STATUS_CHANGED", `${statusLabel(source.status)} → ${statusLabel(to)}.`);
  return { ok: true, state: next, message: `Work order moved to ${to.replaceAll("_", " ")}.` };
}

export type ScenarioId = ScenarioState["id"];

export const scenarioCatalog: Array<{
  id: ScenarioId;
  title: string;
  summary: string;
}> = [
  {
    id: "emergency-breakdown",
    title: "Emergency breakdown",
    summary: "Introduce a critical HVAC failure into a fully scheduled service day.",
  },
  {
    id: "technician-callout",
    title: "Technician calls out",
    summary: "Remove a scheduled technician and expose reassignment pressure.",
  },
  {
    id: "critical-parts-shortage",
    title: "Critical parts shortage",
    summary: "Remove available compressor relays and reveal blocked dispatches.",
  },
  {
    id: "regional-demand-spike",
    title: "Regional demand spike",
    summary: "Add twelve urgent East-region requests and measure backlog pressure.",
  },
  {
    id: "preventive-maintenance-campaign",
    title: "Preventive-maintenance campaign",
    summary: "Release twenty planned jobs against current capacity.",
  },
  {
    id: "fleet-efficiency",
    title: "Fleet efficiency experiment",
    summary: "Align five technicians to the East territory and compare capacity.",
  },
];

function addScenarioOrders(
  state: OperationalState,
  count: number,
  prefix: string,
  category: string,
  priority: WorkOrder["priority"],
) {
  const templates = state.workOrders.filter((order) => order.status !== "CANCELLED").slice(10, 10 + count);
  templates.forEach((template, index) => {
    const order = structuredClone(template);
    order.id = `${prefix}-${String(index + 1).padStart(2, "0")}`;
    order.category = category;
    order.priority = priority;
    order.status = "READY_TO_SCHEDULE";
    order.assignedTechnicianId = undefined;
    order.scheduledStart = undefined;
    order.createdAt = state.now;
    order.firstRespondedAt = undefined;
    order.completedAt = undefined;
    order.closedAt = undefined;
    order.visits = 0;
    order.consumedParts = [];
    order.requiredParts = [];
    order.slaResponseDue = new Date(Date.parse(state.now) + 2 * 3_600_000).toISOString();
    order.slaResolutionDue = new Date(Date.parse(state.now) + (priority === "CRITICAL" ? 4 : 48) * 3_600_000).toISOString();
    order.financials.recognizedRevenueCents = 0;
    order.financials.invoiceStatus = "NOT_ELIGIBLE";
    state.workOrders.unshift(order);
  });
}

export function createScenario(state: OperationalState, id: ScenarioId): ScenarioState {
  const baseline = clone(state);
  const simulated = clone(state);
  const definition = scenarioCatalog.find((item) => item.id === id) ?? scenarioCatalog[0];
  let assumption = "Deterministic scenario assumptions are applied to an isolated copy of the current demo.";
  let impacted: string[] = [];
  let affectedTechnicianId: string | undefined;

  if (id === "technician-callout") {
  const technician = simulated.technicians.find((item) => item.id === "T-104") ?? simulated.technicians[0];
    impacted = technician?.assignments.map((assignment) => assignment.workOrderId) ?? [];
    affectedTechnicianId = technician?.id;
  if (technician) {
    technician.status = "UNAVAILABLE";
    technician.assignments = [];
    for (const workOrderId of impacted) {
      const order = findOrder(simulated, workOrderId);
      if (!order) continue;
      order.assignedTechnicianId = undefined;
      order.scheduledStart = undefined;
      if (order.status === "SCHEDULED") order.status = "READY_TO_SCHEDULE";
      appendAudit(
        simulated,
        order.id,
        "SCENARIO_ASSIGNMENT_REMOVED",
        `${technician.name} callout removed the assignment in isolated scenario state.`,
        "Scenario Lab",
      );
    }
  }
    assumption = `${technician?.name ?? "Selected technician"} is unavailable for the full demo day. Travel estimates remain deterministic and do not represent live traffic.`;
  } else if (id === "emergency-breakdown") {
    addScenarioOrders(simulated, 1, "SC-EMERGENCY", "Emergency breakdown", "CRITICAL");
    impacted = ["SC-EMERGENCY-01"];
    assumption = "One critical East-region breakdown arrives at 9:00 AM with a four-hour resolution target.";
  } else if (id === "critical-parts-shortage") {
    const item = simulated.inventory.find((candidate) => candidate.sku === "CR-440");
    if (item) item.onHand = Object.values(item.reservedBy).reduce((sum, quantity) => sum + quantity, 0);
    impacted = simulated.workOrders
      .filter((order) => order.requiredParts.some((part) => part.sku === "CR-440"))
      .map((order) => order.id);
    assumption = "All unreserved CR-440 compressor relays are removed from available East Hub stock.";
  } else if (id === "regional-demand-spike") {
    addScenarioOrders(simulated, 12, "SC-SPIKE", "Demand spike response", "HIGH");
    impacted = simulated.workOrders.filter((order) => order.id.startsWith("SC-SPIKE")).map((order) => order.id);
    assumption = "Twelve high-priority East-region requests arrive simultaneously; technician shifts remain unchanged.";
  } else if (id === "preventive-maintenance-campaign") {
    addScenarioOrders(simulated, 20, "SC-PM", "Preventive maintenance", "MEDIUM");
    impacted = simulated.workOrders.filter((order) => order.id.startsWith("SC-PM")).map((order) => order.id);
    assumption = "Twenty planned maintenance jobs are released with 48-hour resolution targets and no parts dependency.";
  } else if (id === "fleet-efficiency") {
    const changed = simulated.technicians.filter((technician) => technician.region === "West").slice(0, 5);
    changed.forEach((technician) => {
      technician.region = "East";
    });
    impacted = changed.map((technician) => technician.id);
    assumption = "Five West-region technicians are temporarily staged in the East; travel is a deterministic regional estimate, not live routing.";
  }
  return {
    id,
    title: definition?.title ?? "Operational scenario",
    assumption,
    affectedTechnicianId,
    impactedWorkOrderIds: impacted,
    baseline,
    simulated,
  };
}

export function createTechnicianCalloutScenario(state: OperationalState): ScenarioState {
  return createScenario(state, "technician-callout");
}

export function technicianName(state: OperationalState, id?: string) {
  return state.technicians.find((technician) => technician.id === id)?.name ?? "Unassigned";
}

export function isTechnicianAvailable(technician: Technician) {
  return technician.status === "AVAILABLE" || technician.status === "ON_JOB";
}
