import { availableQuantity, isTechnicianAvailable } from "./operations";
import type { OperationalState, WorkOrder } from "./types";

export interface Metrics {
  openWorkOrders: number;
  urgentWorkOrders: number;
  slaRisk: number;
  overdueJobs: number;
  techniciansAvailable: number;
  techniciansAssigned: number;
  scheduledToday: number;
  completedWorkOrders: number;
  firstTimeFixRate: number;
  averageResponseMinutes: number;
  meanTimeToRepairMinutes: number;
  partsShortages: number;
  scheduledUtilization: number;
  estimatedRevenueCents: number;
  recognizedRevenueCents: number;
  grossMarginRate: number;
}

const closedStatuses = new Set(["CLOSED", "CANCELLED"]);

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function estimatedRevenue(order: WorkOrder) {
  return (
    order.financials.billableLaborCents +
    order.financials.partsChargeCents +
    order.financials.travelChargeCents -
    order.financials.discountCents
  );
}

export function calculateMetrics(state: OperationalState): Metrics {
  const now = Date.parse(state.now);
  const open = state.workOrders.filter((order) => !closedStatuses.has(order.status));
  const completed = state.workOrders.filter((order) => order.status === "CLOSED");
  const eligibleFirstFix = completed.filter((order) => order.visits > 0);
  const firstFix = eligibleFirstFix.filter((order) => order.visits === 1 && !order.reopened);
  const responses = state.workOrders
    .filter((order) => order.firstRespondedAt)
    .map((order) => (Date.parse(order.firstRespondedAt ?? order.createdAt) - Date.parse(order.createdAt)) / 60_000);
  const repairTimes = completed
    .filter((order) => order.completedAt)
    .map((order) => (Date.parse(order.completedAt ?? order.createdAt) - Date.parse(order.createdAt)) / 60_000);
  const scheduledMinutes = state.technicians.reduce(
    (total, technician) =>
      total +
      technician.assignments.reduce(
        (sum, assignment) => sum + (Date.parse(assignment.end) - Date.parse(assignment.start)) / 60_000,
        0,
      ),
    0,
  );
  const availableMinutes = state.technicians
    .filter((technician) => technician.status !== "LEAVE" && technician.status !== "UNAVAILABLE")
    .reduce(
      (total, technician) => total + (Date.parse(technician.shiftEnd) - Date.parse(technician.shiftStart)) / 60_000,
      0,
    );
  const costs = completed.reduce(
    (total, order) => total + order.financials.laborCostCents + order.financials.partsCostCents,
    0,
  );
  const recognized = completed.reduce(
    (total, order) => total + order.financials.recognizedRevenueCents,
    0,
  );

  return {
    openWorkOrders: open.length,
    urgentWorkOrders: open.filter((order) => order.priority === "CRITICAL").length,
    slaRisk: open.filter(
      (order) => Date.parse(order.slaResolutionDue) - now <= 4 * 3_600_000 && Date.parse(order.slaResolutionDue) >= now,
    ).length,
    overdueJobs: open.filter((order) => Date.parse(order.slaResolutionDue) < now).length,
    techniciansAvailable: state.technicians.filter(isTechnicianAvailable).length,
    techniciansAssigned: state.technicians.filter((technician) => technician.assignments.length > 0).length,
    scheduledToday: open.filter((order) => order.status === "SCHEDULED").length,
    completedWorkOrders: completed.length,
    firstTimeFixRate: eligibleFirstFix.length ? (firstFix.length / eligibleFirstFix.length) * 100 : 0,
    averageResponseMinutes: average(responses),
    meanTimeToRepairMinutes: average(repairTimes),
    partsShortages: state.inventory.filter((item) => availableQuantity(item) <= item.reorderPoint).length,
    scheduledUtilization: availableMinutes ? (scheduledMinutes / availableMinutes) * 100 : 0,
    estimatedRevenueCents: open.reduce((total, order) => total + estimatedRevenue(order), 0),
    recognizedRevenueCents: recognized,
    grossMarginRate: recognized ? ((recognized - costs) / recognized) * 100 : 0,
  };
}

export const metricDefinitions = {
  firstTimeFixRate:
    "Eligible closed jobs resolved in one visit without reopening ÷ eligible closed jobs with at least one visit.",
  scheduledUtilization:
    "Scheduled service minutes ÷ available shift minutes for technicians not on leave or unavailable.",
  meanTimeToRepair:
    "Elapsed minutes from work-order creation to work completion for closed repaired incidents.",
  slaRisk:
    "Open work orders with a resolution commitment due within four hours and not yet overdue.",
  grossMargin:
    "(Recognized service revenue − attributable labor and consumed-parts cost) ÷ recognized service revenue.",
};

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
