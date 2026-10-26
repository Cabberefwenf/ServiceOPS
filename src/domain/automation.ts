import { generateInvoice } from "./finance";
import { appendAudit, availableQuantity, clone } from "./operations";
import { contractSla } from "./sla";
import type { OperationalState } from "./types";

/**
 * Deterministic automation rules following PROPOSE → PREVIEW → APPROVE → EXECUTE → RECEIPT.
 * Rules are plain threshold logic; nothing here is machine learning.
 */
export interface AutomationProposal {
  key: string;
  ruleId: string;
  title: string;
  targetId: string;
  /** Human-readable list of exact changes execution will make. */
  preview: string[];
}

export const automationRules = [
  { id: "RULE-INVOICE", name: "Invoice closed work", trigger: "Closed work order with invoice status ELIGIBLE", action: "Generate an invoice from recorded labor, parts, and travel lines" },
  { id: "RULE-REORDER", name: "Reorder review", trigger: "Available stock ≤ reorder point", action: "Record a purchase request (stock changes only on receipt)" },
  { id: "RULE-SLA-ESCALATE", name: "SLA escalation", trigger: "Unassigned open job whose contract resolution SLA is at risk or breached", action: "Record an escalation to the agreement's escalation contacts" },
] as const;

function done(state: OperationalState, key: string) {
  return state.automationReceipts.some((receipt) => receipt.proposalKey === key);
}

export function proposeAutomations(state: OperationalState, limitPerRule = 8): AutomationProposal[] {
  const proposals: AutomationProposal[] = [];
  const invoiceable = state.workOrders.filter((order) => order.status === "CLOSED" && order.financials.invoiceStatus === "ELIGIBLE");
  for (const order of invoiceable.slice(0, limitPerRule)) {
    const key = `RULE-INVOICE:${order.id}`;
    if (done(state, key)) continue;
    const f = order.financials;
    proposals.push({ key, ruleId: "RULE-INVOICE", title: `Invoice ${order.id}`, targetId: order.id, preview: [`Create invoice INV-${order.id.replace(/^WO-/, "")}`, `Lines (cents): labor ${f.billableLaborCents}, parts ${f.partsChargeCents}, travel ${f.travelChargeCents}${f.discountCents ? `, discount −${f.discountCents}` : ""}`, "Set work-order invoice status ELIGIBLE → GENERATED", "Cash received is unchanged"] });
  }
  for (const item of state.inventory.filter((candidate) => availableQuantity(candidate) <= candidate.reorderPoint).slice(0, limitPerRule)) {
    const key = `RULE-REORDER:${item.sku}:${item.onHand}`;
    if (done(state, key)) continue;
    const quantity = item.reorderPoint * 2 - availableQuantity(item);
    proposals.push({ key, ruleId: "RULE-REORDER", title: `Reorder ${item.sku}`, targetId: item.sku, preview: [`Record purchase request for ${quantity} × ${item.sku} (${item.description})`, `Available ${availableQuantity(item)} vs reorder point ${item.reorderPoint}`, "On-hand quantity is unchanged until goods are received"] });
  }
  let escalations = 0;
  for (const order of state.workOrders) {
    if (escalations >= limitPerRule) break;
    if (order.status === "CLOSED" || order.status === "CANCELLED" || order.assignedTechnicianId) continue;
    const sla = contractSla(state, order);
    if (sla.resolution !== "AT_RISK" && sla.resolution !== "BREACHED") continue;
    const key = `RULE-SLA-ESCALATE:${order.id}:${sla.resolution}`;
    if (done(state, key)) continue;
    const agreement = state.agreements.find((item) => item.id === sla.agreementId);
    escalations += 1;
    proposals.push({ key, ruleId: "RULE-SLA-ESCALATE", title: `Escalate ${order.id}`, targetId: order.id, preview: [`Contract resolution SLA ${sla.resolution.replace("_", " ").toLowerCase()} under ${sla.calendarName}`, `Record escalation to ${agreement?.escalationContacts.join(", ") ?? "duty manager"}`, "No assignment or status is changed"] });
  }
  return proposals;
}

export type AutomationOutcome = { ok: true; state: OperationalState; message: string } | { ok: false; error: string };

/** Executes one approved proposal atomically and writes a receipt. Re-executing the same key is rejected. */
export function executeAutomation(state: OperationalState, proposal: AutomationProposal): AutomationOutcome {
  if (done(state, proposal.key)) return { ok: false, error: "This proposal already has a receipt." };
  const current = proposeAutomations(state, Number.MAX_SAFE_INTEGER).find((item) => item.key === proposal.key);
  if (!current) return { ok: false, error: "Proposal is stale: its trigger no longer holds." };
  let next: OperationalState;
  let summary: string;
  if (proposal.ruleId === "RULE-INVOICE") {
    const result = generateInvoice(state, proposal.targetId);
    if (!result.ok) return result;
    next = result.state;
    summary = result.message;
  } else {
    next = clone(state);
    summary = current.preview[0] ?? proposal.title;
    appendAudit(next, proposal.targetId, proposal.ruleId === "RULE-REORDER" ? "PURCHASE_REQUEST_CREATED" : "SLA_ESCALATED", summary, "Automation Center");
  }
  next.automationReceipts.unshift({ id: `RC-${String(next.automationReceipts.length + 1).padStart(4, "0")}`, ruleId: proposal.ruleId, proposalKey: proposal.key, decision: "EXECUTED", timestamp: next.now, summary });
  return { ok: true, state: next, message: `Executed: ${summary}` };
}

export function declineAutomation(state: OperationalState, proposal: AutomationProposal): AutomationOutcome {
  if (done(state, proposal.key)) return { ok: false, error: "This proposal already has a receipt." };
  const next = clone(state);
  next.automationReceipts.unshift({ id: `RC-${String(next.automationReceipts.length + 1).padStart(4, "0")}`, ruleId: proposal.ruleId, proposalKey: proposal.key, decision: "DECLINED", timestamp: next.now, summary: `Declined: ${proposal.title}` });
  appendAudit(next, proposal.targetId, "AUTOMATION_DECLINED", `Operator declined ${proposal.title}.`, "Automation Center");
  return { ok: true, state: next, message: `Declined ${proposal.title}; receipt recorded.` };
}
