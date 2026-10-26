import { z } from "zod";
import { appendAudit, clone } from "./operations";
import { invoiceTotalCents } from "./seed-commercial";
import type { Invoice, OperationalState, OperationResult } from "./types";

/** Generates an invoice for a closed, invoice-eligible work order. Revenue recognition is unchanged; invoicing ≠ cash. */
export function generateInvoice(state: OperationalState, workOrderId: string): OperationResult {
  const source = state.workOrders.find((order) => order.id === workOrderId);
  if (!source) return { ok: false, error: "Work order was not found." };
  if (source.status !== "CLOSED") return { ok: false, error: "Only closed work orders can be invoiced." };
  if (source.financials.invoiceStatus !== "ELIGIBLE") return { ok: false, error: `Invoice status is ${source.financials.invoiceStatus}; nothing to generate.` };
  if (state.invoices.some((invoice) => invoice.workOrderId === workOrderId)) return { ok: false, error: "An invoice already exists for this work order." };
  const next = clone(state);
  const order = next.workOrders.find((item) => item.id === workOrderId);
  if (!order) return { ok: false, error: "Work order was not found." };
  const customer = next.customers.find((item) => item.id === order.customerId);
  const days = customer?.billingTerms === "NET_45" ? 45 : customer?.billingTerms === "PREPAID" ? 0 : 30;
  const f = order.financials;
  const lines = [
    { description: "Billable labor", amountCents: f.billableLaborCents },
    { description: "Parts", amountCents: f.partsChargeCents },
    { description: "Travel", amountCents: f.travelChargeCents },
    ...(f.discountCents ? [{ description: "Discount", amountCents: -f.discountCents }] : []),
  ];
  const invoice: Invoice = {
    id: `INV-${order.id.replace(/^WO-/, "")}`,
    workOrderId: order.id,
    customerId: order.customerId,
    issuedAt: next.now,
    dueAt: new Date(Date.parse(next.now) + days * 86_400_000).toISOString(),
    lines,
    totalCents: invoiceTotalCents(order),
    paidCents: 0,
    status: "ISSUED",
  };
  next.invoices.unshift(invoice);
  order.financials.invoiceStatus = "GENERATED";
  appendAudit(next, invoice.id, "INVOICE_GENERATED", `Invoice ${invoice.id} issued for ${order.id}: ${invoice.totalCents} cents, due ${invoice.dueAt.slice(0, 10)}.`, "Billing");
  return { ok: true, state: next, message: `Invoice ${invoice.id} generated.` };
}

export const paymentSchema = z.object({ amountCents: z.number().int("Payment must be whole cents.").positive("Payment must be positive.") });

export function recordPayment(state: OperationalState, invoiceId: string, amountCents: number): OperationResult {
  const parsed = paymentSchema.safeParse({ amountCents });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const source = state.invoices.find((invoice) => invoice.id === invoiceId);
  if (!source) return { ok: false, error: "Invoice was not found." };
  const outstanding = source.totalCents - source.paidCents;
  if (amountCents > outstanding) return { ok: false, error: `Payment exceeds outstanding balance of ${outstanding} cents.` };
  const next = clone(state);
  const invoice = next.invoices.find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: "Invoice was not found." };
  invoice.paidCents += amountCents;
  invoice.status = invoice.paidCents === invoice.totalCents ? "PAID" : "PARTIALLY_PAID";
  appendAudit(next, invoice.id, "PAYMENT_RECORDED", `${amountCents} cents received; outstanding ${invoice.totalCents - invoice.paidCents} cents.`, "Billing");
  return { ok: true, state: next, message: `Payment recorded on ${invoice.id}.` };
}

export interface FinanceSummary {
  invoicedCents: number;
  cashReceivedCents: number;
  outstandingCents: number;
  overdueCents: number;
  awaitingInvoiceCount: number;
  awaitingInvoiceCents: number;
}

export function financeSummary(state: OperationalState): FinanceSummary {
  const now = Date.parse(state.now);
  let invoicedCents = 0, cashReceivedCents = 0, overdueCents = 0;
  for (const invoice of state.invoices) {
    invoicedCents += invoice.totalCents;
    cashReceivedCents += invoice.paidCents;
    if (Date.parse(invoice.dueAt) < now) overdueCents += invoice.totalCents - invoice.paidCents;
  }
  const awaiting = state.workOrders.filter((order) => order.financials.invoiceStatus === "ELIGIBLE");
  return {
    invoicedCents,
    cashReceivedCents,
    outstandingCents: invoicedCents - cashReceivedCents,
    overdueCents,
    awaitingInvoiceCount: awaiting.length,
    awaitingInvoiceCents: awaiting.reduce((sum, order) => sum + invoiceTotalCents(order), 0),
  };
}
