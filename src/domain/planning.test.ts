import { describe, expect, it } from "vitest";
import { declineAutomation, executeAutomation, proposeAutomations } from "./automation";
import { financeSummary, generateInvoice, recordPayment } from "./finance";
import { checkIntegrity, createScenario, scenarioCatalog } from "./operations";
import { proposeRecovery, runScheduler } from "./planning";
import { createSeedState } from "./seed";
import { addBusinessMinutes, businessMinutesBetween, contractSla } from "./sla";
import type { BusinessCalendar } from "./types";

const std: BusinessCalendar = { id: "X", name: "std", timeZone: "America/New_York", workingDays: [1, 2, 3, 4, 5], openMinute: 480, closeMinute: 1020, holidays: ["2026-11-26"] };

describe("business-hours SLA calendar", () => {
  it("rolls past close, weekends, and holidays", () => {
    // Fri Oct 30 2026 16:00 ET (+4h business) → Mon Nov 2 11:00 ET (EST, UTC-5 after DST ends Nov 1)
    expect(addBusinessMinutes("2026-10-30T20:00:00.000Z", 240, std)).toBe("2026-11-02T16:00:00.000Z");
    // Wed Nov 25 16:00 ET + 2h → skips Thanksgiving Thu → Fri Nov 27 09:00 ET
    expect(addBusinessMinutes("2026-11-25T21:00:00.000Z", 120, std)).toBe("2026-11-27T14:00:00.000Z");
    // Before opening starts at opening
    expect(addBusinessMinutes("2026-10-26T10:00:00.000Z", 60, std)).toBe("2026-10-26T13:00:00.000Z");
  });
  it("measures business minutes between instants and inverts addBusinessMinutes", () => {
    const start = "2026-10-30T20:00:00.000Z";
    expect(businessMinutesBetween(start, addBusinessMinutes(start, 600, std), std)).toBe(600);
    expect(businessMinutesBetween("2026-10-31T12:00:00.000Z", "2026-11-01T20:00:00.000Z", std)).toBe(0);
  });
  it("computes contract SLA for seeded orders from the governing agreement", () => {
    const state = createSeedState();
    const order = state.workOrders.find((item) => item.id === "WO-10483");
    if (!order) throw new Error("missing");
    const sla = contractSla(state, order);
    expect(sla.agreementId).toBe("SA-0001");
    expect(sla.calendarName).toMatch(/24×7/);
    expect(sla.response).toBe("MET");
  });
});

describe("deterministic scheduler", () => {
  it("is deterministic, compares against a naive baseline, and never overlaps", () => {
    const state = createSeedState();
    const a = runScheduler(state);
    const b = runScheduler(state);
    expect(a.heuristicSummary).toEqual(b.heuristicSummary);
    expect(a.workOrderIds.length).toBeGreaterThan(10);
    expect(a.heuristicSummary.criticalAssigned).toBeGreaterThanOrEqual(a.baselineSummary.criticalAssigned);
    expect(checkIntegrity(a.heuristic.resultingState)).toEqual([]);
    expect(checkIntegrity(a.baseline.resultingState)).toEqual([]);
    expect(state.workOrders.filter((order) => order.status === "SCHEDULED").length).toBe(createSeedState().workOrders.filter((order) => order.status === "SCHEDULED").length);
  });
});

describe("recovery proposals for every scenario", () => {
  for (const scenario of scenarioCatalog) {
    it(`${scenario.id} yields a deterministic plan that preserves integrity`, () => {
      const created = createScenario(createSeedState(), scenario.id, { technicianId: "T-104" });
      const plan = proposeRecovery(created);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.method.length).toBeGreaterThan(0);
      expect(checkIntegrity(plan.resultingState)).toEqual([]);
      expect(proposeRecovery(created).steps).toEqual(plan.steps);
    });
  }
  it("parts shortage records a purchase request without inventing stock", () => {
    const created = createScenario(createSeedState(), "critical-parts-shortage");
    const plan = proposeRecovery(created);
    const before = created.simulated.inventory.find((item) => item.sku === "CR-440")?.onHand;
    expect(plan.resultingState.inventory.find((item) => item.sku === "CR-440")?.onHand).toBe(before);
    expect(plan.resultingState.audit[0]?.type).toBe("PURCHASE_REQUEST_CREATED");
  });
});

describe("invoicing and cash are separate", () => {
  it("generates an invoice for an eligible order and records partial then full payment in integer cents", () => {
    const state = createSeedState();
    const eligible = state.workOrders.find((order) => order.financials.invoiceStatus === "ELIGIBLE");
    if (!eligible) throw new Error("seed needs an eligible order");
    const before = financeSummary(state);
    const invoiced = generateInvoice(state, eligible.id);
    if (!invoiced.ok) throw new Error(invoiced.error);
    const invoice = invoiced.state.invoices[0];
    if (!invoice) throw new Error("no invoice");
    const after = financeSummary(invoiced.state);
    expect(after.invoicedCents - before.invoicedCents).toBe(invoice.totalCents);
    expect(after.cashReceivedCents).toBe(before.cashReceivedCents);
    expect(generateInvoice(invoiced.state, eligible.id).ok).toBe(false);
    expect(recordPayment(invoiced.state, invoice.id, 10.5).ok).toBe(false);
    expect(recordPayment(invoiced.state, invoice.id, invoice.totalCents + 1).ok).toBe(false);
    const partial = recordPayment(invoiced.state, invoice.id, 100);
    if (!partial.ok) throw new Error(partial.error);
    expect(partial.state.invoices[0]?.status).toBe("PARTIALLY_PAID");
    const full = recordPayment(partial.state, invoice.id, invoice.totalCents - 100);
    if (!full.ok) throw new Error(full.error);
    expect(full.state.invoices[0]?.status).toBe("PAID");
    expect(checkIntegrity(full.state)).toEqual([]);
  });
});

describe("automation center", () => {
  it("proposes, executes once with a receipt, rejects replay, and records declines", () => {
    const state = createSeedState();
    const proposals = proposeAutomations(state);
    expect(new Set(proposals.map((proposal) => proposal.ruleId))).toEqual(new Set(["RULE-INVOICE", "RULE-REORDER", "RULE-SLA-ESCALATE"]));
    const invoice = proposals.find((proposal) => proposal.ruleId === "RULE-INVOICE");
    if (!invoice) throw new Error("none");
    const executed = executeAutomation(state, invoice);
    if (!executed.ok) throw new Error(executed.error);
    expect(executed.state.automationReceipts[0]?.decision).toBe("EXECUTED");
    expect(executed.state.invoices.length).toBe(state.invoices.length + 1);
    expect(executeAutomation(executed.state, invoice).ok).toBe(false);
    const reorder = proposals.find((proposal) => proposal.ruleId === "RULE-REORDER");
    if (!reorder) throw new Error("none");
    const declined = declineAutomation(executed.state, reorder);
    if (!declined.ok) throw new Error(declined.error);
    expect(declined.state.automationReceipts[0]?.decision).toBe("DECLINED");
    expect(proposeAutomations(declined.state).some((proposal) => proposal.key === reorder.key)).toBe(false);
  });
});

describe("work-order intake", async () => {
  const { createWorkOrder, maintenanceDue } = await import("./intake");
  it("creates a requested order with agreement-derived SLA and audit, and validates input", () => {
    const state = createSeedState();
    const asset = state.assets[0];
    if (!asset) throw new Error("no asset");
    const bad = createWorkOrder(state, { customerId: "C-0002", assetId: asset.id, priority: "HIGH", category: "Corrective maintenance", description: "Pump noise at startup", estimatedDurationMinutes: 90 });
    expect(bad.ok).toBe(false);
    const result = createWorkOrder(state, { customerId: asset.customerId, assetId: asset.id, priority: "HIGH", category: "Corrective maintenance", description: "Pump noise at startup", estimatedDurationMinutes: 90 });
    if (!result.ok) throw new Error(result.error);
    const order = result.state.workOrders[0];
    expect(order?.id).toBe("WO-10484");
    expect(order?.status).toBe("REQUESTED");
    expect(Date.parse(order?.slaResolutionDue ?? "")).toBeGreaterThan(Date.parse(state.now));
    expect(result.state.audit[0]?.type).toBe("WORK_ORDER_CREATED");
    expect(checkIntegrity(result.state)).toEqual([]);
  });
  it("flags overdue preventive maintenance", () => {
    expect(maintenanceDue({ lastServiceDate: "2026-01-01T00:00:00.000Z", maintenanceIntervalDays: 90 }, "2026-10-26T13:00:00.000Z").overdue).toBe(true);
  });
});
