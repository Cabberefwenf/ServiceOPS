import { z } from "zod";
import { WORK_ORDER_STATUSES } from "./types";

/**
 * Strict persisted-state schemas. Every object is `.strict()` so unknown keys from
 * tampered or future snapshots are rejected instead of silently trusted.
 */
const id = z.string().min(1).max(64);
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid date");
const cents = z.number().int().safe();
const count = z.number().int().nonnegative().safe();
const shortText = z.string().max(500);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const region = z.enum(["East", "Central", "West"]);
const byPriority = z.object({ LOW: count, MEDIUM: count, HIGH: count, CRITICAL: count }).strict();

const customer = z.object({ id, name: shortText, contactName: shortText, email: shortText, billingTerms: z.enum(["NET_30", "NET_45", "PREPAID"]) }).strict();
const location = z.object({ id, customerId: id, name: shortText, address: shortText, region }).strict();
const asset = z
  .object({ id, customerId: id, locationId: id, category: shortText, manufacturer: shortText, model: shortText, serialNumber: shortText, installDate: isoDate, maintenanceIntervalDays: count, lastServiceDate: isoDate })
  .strict();
const assignment = z.object({ workOrderId: id, start: isoDate, end: isoDate, locked: z.boolean().optional() }).strict();
const technician = z
  .object({
    id, name: shortText, region,
    skills: z.array(shortText).max(50), certifications: z.array(shortText).max(50),
    shiftStart: isoDate, shiftEnd: isoDate,
    status: z.enum(["AVAILABLE", "ON_JOB", "UNAVAILABLE", "LEAVE"]),
    assignments: z.array(assignment).max(500),
    laborCostRateCents: cents, completedJobs: count, firstTimeFixJobs: count,
  })
  .strict();
const requiredPart = z.object({ sku: id, quantity: z.number().int().positive() }).strict();
const consumedPart = z.object({ sku: id, quantity: z.number().int().positive(), unitCostCents: cents, unitPriceCents: cents }).strict();
const financials = z
  .object({
    estimatedLaborMinutes: count, laborCostCents: cents, billableLaborCents: cents, partsCostCents: cents,
    partsChargeCents: cents, travelChargeCents: cents, discountCents: cents, recognizedRevenueCents: cents,
    invoiceStatus: z.enum(["NOT_ELIGIBLE", "ELIGIBLE", "GENERATED"]),
  })
  .strict();
const workOrder = z
  .object({
    id, customerId: id, locationId: id, assetId: id, category: shortText, description: shortText, problemCode: shortText,
    priority, status: z.enum(WORK_ORDER_STATUSES),
    requiredSkills: z.array(shortText).max(20), requiredCertifications: z.array(shortText).max(20),
    requiredParts: z.array(requiredPart).max(50), consumedParts: z.array(consumedPart).max(50),
    assignedTechnicianId: id.optional(), scheduledStart: isoDate.optional(),
    estimatedDurationMinutes: count, actualLaborMinutes: count.optional(),
    appointmentStart: isoDate, appointmentEnd: isoDate, createdAt: isoDate,
    firstRespondedAt: isoDate.optional(), completedAt: isoDate.optional(), closedAt: isoDate.optional(),
    slaResponseDue: isoDate, slaResolutionDue: isoDate, visits: count, reopened: z.boolean(),
    resolutionCode: shortText.optional(), completionNotes: z.string().max(4000).optional(),
    financials,
  })
  .strict();
const inventoryItem = z
  .object({
    sku: id, description: shortText, category: shortText, warehouse: shortText,
    onHand: z.number().int().safe(), reorderPoint: count, unitCostCents: cents, unitPriceCents: cents,
    reservedBy: z.record(id, z.number().int()), compatibleAssetTypes: z.array(shortText).max(20),
  })
  .strict();
const auditEvent = z.object({ id, timestamp: isoDate, actor: shortText, type: shortText, entityId: id, detail: z.string().max(2000) }).strict();
const calendar = z
  .object({
    id, name: shortText, timeZone: shortText,
    workingDays: z.array(z.number().int().min(0).max(6)).max(7),
    openMinute: z.number().int().min(0).max(1440), closeMinute: z.number().int().min(0).max(1440),
    holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
  })
  .strict();
const agreement = z
  .object({
    id, customerId: id, name: shortText, tier: z.enum(["PLATINUM", "GOLD", "STANDARD"]),
    coverageStart: isoDate, coverageEnd: isoDate, calendarId: id,
    coveredLocationIds: z.array(id).max(500), contractedServiceTypes: z.array(shortText).max(20),
    responseMinutes: byPriority, resolutionMinutes: byPriority,
    exclusions: z.array(shortText).max(20), escalationContacts: z.array(shortText).max(20),
  })
  .strict();
const invoice = z
  .object({
    id, workOrderId: id, customerId: id, issuedAt: isoDate, dueAt: isoDate,
    lines: z.array(z.object({ description: shortText, amountCents: cents }).strict()).max(50),
    totalCents: cents, paidCents: cents, status: z.enum(["ISSUED", "PARTIALLY_PAID", "PAID"]),
  })
  .strict();
const receipt = z
  .object({ id, ruleId: id, proposalKey: z.string().max(200), decision: z.enum(["EXECUTED", "DECLINED"]), timestamp: isoDate, summary: z.string().max(2000) })
  .strict();

const LIMIT = 20_000;
const coreShape = {
  organizationName: shortText,
  now: isoDate,
  customers: z.array(customer).max(LIMIT),
  locations: z.array(location).max(LIMIT),
  assets: z.array(asset).max(LIMIT),
  technicians: z.array(technician).max(1_000),
  workOrders: z.array(workOrder).max(LIMIT),
  inventory: z.array(inventoryItem).max(LIMIT),
  audit: z.array(auditEvent).max(50_000),
};

export const stateV1Schema = z.object({ schemaVersion: z.literal(1), ...coreShape }).strict();
export const stateV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    ...coreShape,
    calendars: z.array(calendar).max(100),
    agreements: z.array(agreement).max(LIMIT),
    invoices: z.array(invoice).max(LIMIT),
    automationReceipts: z.array(receipt).max(LIMIT),
  })
  .strict();

const scenarioIds = z.enum([
  "emergency-breakdown", "technician-callout", "critical-parts-shortage",
  "regional-demand-spike", "preventive-maintenance-campaign", "fleet-efficiency",
]);
function scenarioSchema<T extends z.ZodTypeAny>(state: T) {
  return z
    .object({
      id: scenarioIds, title: shortText, assumption: z.string().max(2000),
      affectedTechnicianId: id.optional(), impactedWorkOrderIds: z.array(id).max(LIMIT),
      recoveryAccepted: z.boolean().optional(), baseline: state, simulated: state,
    })
    .strict();
}

export const sessionV1Schema = z.object({ schemaVersion: z.literal(1), canonical: stateV1Schema, scenario: scenarioSchema(stateV1Schema).nullable() }).strict();
export const sessionV2Schema = z.object({ schemaVersion: z.literal(2), canonical: stateV2Schema, scenario: scenarioSchema(stateV2Schema).nullable() }).strict();
