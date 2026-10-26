import { z } from "zod";
import { appendAudit, clone } from "./operations";
import { addBusinessMinutes, agreementForOrder } from "./sla";
import type { OperationalState, OperationResult, WorkOrder } from "./types";

const skillByCategory: Record<string, string> = {
  "HVAC System": "Commercial HVAC",
  "Industrial Pump": "Rotating Equipment",
  "Conveyor System": "Conveyor Systems",
  "Electrical Panel": "Industrial Electrical",
  "Warehouse Door": "Dock Systems",
  Compressor: "Compressed Air",
  "Commercial Refrigeration": "Commercial HVAC",
};

export const newWorkOrderSchema = z.object({
  customerId: z.string().min(1, "Choose a customer."),
  assetId: z.string().min(1, "Choose an asset."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  category: z.enum(["Corrective maintenance", "Preventive maintenance"]),
  description: z.string().trim().min(8, "Describe the problem in at least 8 characters.").max(200),
  estimatedDurationMinutes: z.number().int().min(30).max(480),
});
export type NewWorkOrderInput = z.infer<typeof newWorkOrderSchema>;

/** Creates a REQUESTED work order. SLA due dates come from the governing agreement's business calendar. */
export function createWorkOrder(state: OperationalState, input: NewWorkOrderInput): OperationResult {
  const parsed = newWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(" ") };
  const data = parsed.data;
  const asset = state.assets.find((item) => item.id === data.assetId);
  if (!asset || asset.customerId !== data.customerId) return { ok: false, error: "Asset does not belong to the selected customer." };
  const next = clone(state);
  const highest = next.workOrders.reduce((max, order) => {
    const n = Number(order.id.replace(/^WO-/, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 10_000);
  const start = new Date(Date.parse(next.now) + 2 * 3_600_000).toISOString();
  const order: WorkOrder = {
    id: `WO-${highest + 1}`,
    customerId: data.customerId,
    locationId: asset.locationId,
    assetId: asset.id,
    category: data.category,
    description: data.description,
    problemCode: data.category === "Preventive maintenance" ? "PM_DUE" : "EQUIPMENT_FAULT",
    priority: data.priority,
    status: "REQUESTED",
    requiredSkills: [skillByCategory[asset.category] ?? "General Service"],
    requiredCertifications: [],
    requiredParts: [],
    consumedParts: [],
    estimatedDurationMinutes: data.estimatedDurationMinutes,
    appointmentStart: start,
    appointmentEnd: new Date(Date.parse(start) + 4 * 3_600_000).toISOString(),
    createdAt: next.now,
    slaResponseDue: next.now,
    slaResolutionDue: next.now,
    visits: 0,
    reopened: false,
    financials: {
      estimatedLaborMinutes: data.estimatedDurationMinutes,
      laborCostCents: 0,
      billableLaborCents: Math.round((data.estimatedDurationMinutes / 60) * 15_000),
      partsCostCents: 0,
      partsChargeCents: 0,
      travelChargeCents: 7_500,
      discountCents: 0,
      recognizedRevenueCents: 0,
      invoiceStatus: "NOT_ELIGIBLE",
    },
  };
  const agreement = agreementForOrder(next, order);
  const calendar = agreement && next.calendars.find((item) => item.id === agreement.calendarId);
  if (agreement && calendar) {
    order.slaResponseDue = addBusinessMinutes(order.createdAt, agreement.responseMinutes[order.priority], calendar);
    order.slaResolutionDue = addBusinessMinutes(order.createdAt, agreement.resolutionMinutes[order.priority], calendar);
  } else {
    order.slaResponseDue = new Date(Date.parse(next.now) + 8 * 3_600_000).toISOString();
    order.slaResolutionDue = new Date(Date.parse(next.now) + 48 * 3_600_000).toISOString();
  }
  next.workOrders.unshift(order);
  appendAudit(next, order.id, "WORK_ORDER_CREATED", `${data.priority} ${data.category.toLowerCase()} request for ${asset.category} ${asset.id}${agreement ? ` under ${agreement.id}` : " (no agreement: default targets)"}.`);
  return { ok: true, state: next, message: `${order.id} created as Requested.` };
}

/** Asset health: preventive maintenance overdue when last service + interval is before now. */
export function maintenanceDue(asset: { lastServiceDate: string; maintenanceIntervalDays: number }, now: string) {
  const due = Date.parse(asset.lastServiceDate) + asset.maintenanceIntervalDays * 86_400_000;
  return { dueAt: new Date(due).toISOString(), overdue: due < Date.parse(now), daysUntil: Math.round((due - Date.parse(now)) / 86_400_000) };
}
