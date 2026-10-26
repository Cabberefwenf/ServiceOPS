"use client";

import { AlertTriangle, Check, CircleDollarSign, ClipboardCheck, Clock3, FileText, Play, Receipt, Search, ShieldCheck, Wrench, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { automationRules, declineAutomation, executeAutomation, proposeAutomations, type AutomationProposal } from "@/domain/automation";
import { financeSummary, generateInvoice, recordPayment } from "@/domain/finance";
import { maintenanceDue } from "@/domain/intake";
import { availableQuantity } from "@/domain/operations";
import { runScheduler, type ScheduleRun } from "@/domain/planning";
import { contractSla } from "@/domain/sla";
import type { OperationalState, OperationResult, Region } from "@/domain/types";
import { EmptyState, Kpi, label, money, PageTitle, PriorityTag, shortDate, Status, time } from "./ui";

export interface ScreenProps {
  state: OperationalState;
  commit: (result: OperationResult) => void;
  onOpenOrder: (id: string) => void;
}

const OPEN = (status: string) => status !== "CLOSED" && status !== "CANCELLED";

function MoreButton({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return <button className="secondary-button more-button" onClick={onMore}>Show {Math.min(25, total - shown)} more ({total - shown} remaining)</button>;
}

export function TechniciansView({ state, onOpenOrder }: ScreenProps) {
  const [region, setRegion] = useState<"ALL" | Region>("ALL");
  const [selectedId, setSelectedId] = useState(state.technicians[0]?.id ?? "");
  const technicians = state.technicians.filter((technician) => region === "ALL" || technician.region === region);
  const selected = state.technicians.find((technician) => technician.id === selectedId);
  return (
    <>
      <PageTitle title="Technicians" body="Field roster: qualifications, shift, current load, and first-time-fix record.">
        <select aria-label="Filter technicians by region" value={region} onChange={(event) => setRegion(event.target.value as "ALL" | Region)}><option value="ALL">All regions</option><option>East</option><option>Central</option><option>West</option></select>
      </PageTitle>
      <div className="split-layout">
        <section className="panel"><div className="data-table-wrap"><table className="data-table" data-testid="technician-table"><thead><tr><th>Technician</th><th>Region</th><th>Status</th><th>Assignments</th><th>First-time fix</th></tr></thead><tbody>
          {technicians.map((technician) => (
            <tr key={technician.id} className={technician.id === selectedId ? "selected-row" : ""} onClick={() => setSelectedId(technician.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(technician.id); }}>
              <td><strong>{technician.name}</strong><small>{technician.id}</small></td><td>{technician.region}</td><td><Status value={technician.status} /></td><td>{technician.assignments.length}</td>
              <td>{technician.completedJobs ? `${((technician.firstTimeFixJobs / technician.completedJobs) * 100).toFixed(0)}%` : "—"}<small>{technician.completedJobs} closed jobs</small></td>
            </tr>
          ))}
        </tbody></table></div></section>
        {selected && (
          <section className="panel detail-panel" aria-label={`${selected.name} profile`} data-testid="technician-detail">
            <h2>{selected.name}</h2><p>{selected.id} · {selected.region} · shift {time(selected.shiftStart)}–{time(selected.shiftEnd)} ET · labor cost {money(selected.laborCostRateCents)}/h</p>
            <h3>Skills</h3><div className="chip-list">{selected.skills.map((skill) => <span key={skill}><Wrench /> {skill}</span>)}</div>
            <h3>Certifications</h3><div className="chip-list">{selected.certifications.length ? selected.certifications.map((cert) => <span key={cert}><ShieldCheck /> {cert}</span>) : <span>None recorded</span>}</div>
            <h3>Schedule</h3>
            {selected.assignments.length ? <ul className="plain-list">{selected.assignments.map((assignment) => <li key={assignment.workOrderId}><button className="text-button" onClick={() => onOpenOrder(assignment.workOrderId)}>{assignment.workOrderId}</button> {shortDate(assignment.start)} {time(assignment.start)}–{time(assignment.end)}{assignment.locked ? " · locked" : ""}</li>)}</ul> : <p>No assignments; available capacity.</p>}
          </section>
        )}
      </div>
    </>
  );
}

export function CustomersView({ state, onOpenOrder }: ScreenProps) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(25);
  const [selectedId, setSelectedId] = useState(state.customers[0]?.id ?? "");
  const customers = state.customers.filter((customer) => `${customer.id} ${customer.name} ${customer.contactName}`.toLowerCase().includes(query.toLowerCase()));
  const selected = state.customers.find((customer) => customer.id === selectedId);
  const locations = state.locations.filter((location) => location.customerId === selectedId);
  const agreements = state.agreements.filter((agreement) => agreement.customerId === selectedId);
  const openOrders = state.workOrders.filter((order) => order.customerId === selectedId && OPEN(order.status));
  const invoices = state.invoices.filter((invoice) => invoice.customerId === selectedId);
  const balance = invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0);
  return (
    <>
      <PageTitle title="Customers" body="Accounts, sites, agreements, open work, and receivable balance." />
      <div className="split-layout">
        <section className="panel">
          <div className="filters-row"><label className="search-field"><Search /><span className="sr-only">Search customers</span><input data-testid="customer-search" value={query} onChange={(event) => { setQuery(event.target.value); setShown(25); }} placeholder="Search customers or contacts" /></label><span className="result-count">{customers.length} customers</span></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Terms</th></tr></thead><tbody>
            {customers.slice(0, shown).map((customer) => <tr key={customer.id} className={customer.id === selectedId ? "selected-row" : ""} onClick={() => setSelectedId(customer.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(customer.id); }}><td><strong>{customer.name}</strong><small>{customer.id}</small></td><td>{customer.contactName}<small>{customer.email}</small></td><td>{label(customer.billingTerms)}</td></tr>)}
          </tbody></table></div>
          <MoreButton shown={shown} total={customers.length} onMore={() => setShown(shown + 25)} />
        </section>
        {selected ? (
          <section className="panel detail-panel" data-testid="customer-detail">
            <h2>{selected.name}</h2><p>{selected.contactName} · {selected.email} · {label(selected.billingTerms)}</p>
            <div className="mini-kpis"><div><small>Sites</small><strong>{locations.length}</strong></div><div><small>Open work orders</small><strong>{openOrders.length}</strong></div><div><small>Open receivable</small><strong>{money(balance)}</strong></div></div>
            <h3>Agreements</h3>{agreements.length ? <ul className="plain-list">{agreements.map((agreement) => <li key={agreement.id}><b>{agreement.id}</b> · {agreement.tier} · {agreement.name} · {shortDate(agreement.coverageStart)}–{shortDate(agreement.coverageEnd)}</li>)}</ul> : <p>No service agreement; default targets apply.</p>}
            <h3>Sites</h3><ul className="plain-list">{locations.map((location) => <li key={location.id}>{location.name} · {location.address} · {location.region}</li>)}</ul>
            <h3>Open work</h3>{openOrders.length ? <ul className="plain-list">{openOrders.map((order) => <li key={order.id}><button className="text-button" onClick={() => onOpenOrder(order.id)}>{order.id}</button> {order.description} · {label(order.status)}</li>)}</ul> : <p>No open work orders.</p>}
          </section>
        ) : <EmptyState title="No customer selected" body="Choose a customer to see sites, agreements, and work." />}
      </div>
    </>
  );
}

export function AssetsView({ state, onOpenOrder }: ScreenProps) {
  const [filter, setFilter] = useState<"ALL" | "OVERDUE">("ALL");
  const [shown, setShown] = useState(25);
  const [selectedId, setSelectedId] = useState("");
  const rows = useMemo(() => state.assets.map((asset) => ({ asset, pm: maintenanceDue(asset, state.now) })).filter((row) => filter === "ALL" || row.pm.overdue).sort((a, b) => a.pm.daysUntil - b.pm.daysUntil), [state, filter]);
  const overdueCount = state.assets.filter((asset) => maintenanceDue(asset, state.now).overdue).length;
  const selected = state.assets.find((asset) => asset.id === selectedId);
  const history = selected ? state.workOrders.filter((order) => order.assetId === selected.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  return (
    <>
      <PageTitle title="Assets" body="Installed equipment, preventive-maintenance status, and service history.">
        <select aria-label="Filter assets" data-testid="asset-filter" value={filter} onChange={(event) => { setFilter(event.target.value as "ALL" | "OVERDUE"); setShown(25); }}><option value="ALL">All assets ({state.assets.length})</option><option value="OVERDUE">PM overdue ({overdueCount})</option></select>
      </PageTitle>
      <div className="split-layout">
        <section className="panel"><div className="data-table-wrap"><table className="data-table" data-testid="asset-table"><thead><tr><th>Asset</th><th>Customer</th><th>Last service</th><th>PM due</th></tr></thead><tbody>
          {rows.slice(0, shown).map(({ asset, pm }) => <tr key={asset.id} className={asset.id === selectedId ? "selected-row" : ""} onClick={() => setSelectedId(asset.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedId(asset.id); }}><td><strong>{asset.category}</strong><small>{asset.id} · {asset.model}</small></td><td>{state.customers.find((customer) => customer.id === asset.customerId)?.name}</td><td>{shortDate(asset.lastServiceDate)}</td><td className={pm.overdue ? "danger-text" : ""}>{pm.overdue ? <><AlertTriangle aria-hidden="true" /> {-pm.daysUntil} days overdue</> : `in ${pm.daysUntil} days`}</td></tr>)}
        </tbody></table></div><MoreButton shown={shown} total={rows.length} onMore={() => setShown(shown + 25)} /></section>
        {selected ? (
          <section className="panel detail-panel" data-testid="asset-detail">
            <h2>{selected.category} · {selected.model}</h2><p>{selected.manufacturer} · serial {selected.serialNumber} · installed {shortDate(selected.installDate)} · PM every {selected.maintenanceIntervalDays} days</p>
            <h3>Service history ({history.length})</h3>
            {history.length ? <ul className="plain-list">{history.map((order) => <li key={order.id}><button className="text-button" onClick={() => onOpenOrder(order.id)}>{order.id}</button> {shortDate(order.createdAt)} · {order.description} · {label(order.status)}{order.resolutionCode ? ` · ${label(order.resolutionCode)}` : ""}</li>)}</ul> : <p>No work orders recorded for this asset.</p>}
          </section>
        ) : <EmptyState title="Select an asset" body="Service history and maintenance status appear here." />}
      </div>
    </>
  );
}

export function SchedulingView({ state, commit, onOpenOrder }: ScreenProps) {
  const [run, setRun] = useState<{ result: ScheduleRun; ms: number; forNow: string; auditLength: number } | null>(null);
  const stale = run && (run.auditLength !== state.audit.length || run.forNow !== state.now);
  const ready = state.workOrders.filter((order) => order.status === "READY_TO_SCHEDULE").length;
  function execute() {
    const started = performance.now();
    const result = runScheduler(state);
    setRun({ result, ms: performance.now() - started, forNow: state.now, auditLength: state.audit.length });
  }
  function accept() {
    if (!run || stale) return;
    const assigned = run.result.heuristicSummary.assigned;
    commit({ ok: true, state: run.result.heuristic.resultingState, message: `${assigned} assignment(s) applied from the scheduling run.` });
    setRun(null);
  }
  const h = run?.result.heuristicSummary;
  const b = run?.result.baselineSummary;
  return (
    <>
      <PageTitle title="Scheduling" body="Batch-schedule the ready queue with a deterministic greedy heuristic and compare it to a naive first-available baseline.">
        <button className="primary-button" data-testid="run-scheduler" onClick={execute} disabled={ready === 0}><Play /> Run scheduler ({ready} ready)</button>
      </PageTitle>
      <section className="panel">
        <p className="method-note">Method: jobs ordered by priority, contract SLA due, then id; each gets the best-scoring feasible technician (skills, certifications, shift, existing blocks, parts readiness, travel estimate). This is a heuristic, not a proven optimum. Nothing changes until you accept.</p>
        {!run && <EmptyState title={ready ? "Ready to run" : "Nothing to schedule"} body={ready ? `${ready} work orders are ready to schedule.` : "Move work orders to Ready to schedule first."} />}
        {run && h && b && (
          <div data-testid="schedule-result">
            <div className="comparison-grid">
              <div><small>Assigned</small><span>{b.assigned}</span><strong>{h.assigned}</strong><em>baseline → heuristic</em></div>
              <div><small>Critical assigned</small><span>{b.criticalAssigned}/{b.criticalTotal}</span><strong>{h.criticalAssigned}/{h.criticalTotal}</strong><em>baseline → heuristic</em></div>
              <div><small>Estimated travel</small><span>{b.totalTravelMinutes} min</span><strong>{h.totalTravelMinutes} min</strong><em>baseline → heuristic</em></div>
              <div><small>Runtime</small><strong data-testid="schedule-runtime">{run.ms.toFixed(1)} ms</strong><em>measured in this browser</em></div>
            </div>
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Work order</th><th>Priority</th><th>Proposal</th><th>Reason</th></tr></thead><tbody>
              {run.result.heuristic.proposals.map((proposal) => <tr key={proposal.workOrderId}><td><button className="text-button" onClick={() => onOpenOrder(proposal.workOrderId)}>{proposal.workOrderId}</button></td><td><PriorityTag value={proposal.priority} /></td><td className={proposal.feasible ? "" : "danger-text"}>{proposal.feasible ? `${proposal.technicianName} (${proposal.technicianId})` : "Unassigned"}</td><td>{proposal.explanation}</td></tr>)}
            </tbody></table></div>
            {stale ? <p className="danger-text">State changed since this run. Run again before accepting.</p> : <button className="primary-button" data-testid="accept-schedule" disabled={h.assigned === 0} onClick={accept}><Check /> Accept {h.assigned} assignment(s)</button>}
          </div>
        )}
      </section>
    </>
  );
}

export function AgreementsView({ state, onOpenOrder }: ScreenProps) {
  const at = state.workOrders.filter((order) => OPEN(order.status)).map((order) => ({ order, sla: contractSla(state, order) })).filter((row) => row.sla.resolution === "AT_RISK" || row.sla.resolution === "BREACHED");
  return (
    <>
      <PageTitle title="Service agreements" body="Contract tiers, business calendars, and contract SLA status computed in business minutes." />
      <section className="panel"><h2>Business calendars</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Calendar</th><th>Hours (ET)</th><th>Holidays</th></tr></thead><tbody>
        {state.calendars.map((calendar) => <tr key={calendar.id}><td><strong>{calendar.name}</strong><small>{calendar.id}</small></td><td>{calendar.workingDays.length === 7 && calendar.closeMinute - calendar.openMinute >= 1440 ? "24 × 7" : `${calendar.workingDays.length} days · ${calendar.openMinute / 60}:00–${calendar.closeMinute / 60}:00`}</td><td>{calendar.holidays.length ? calendar.holidays.join(", ") : "None"}</td></tr>)}
      </tbody></table></div></section>
      <section className="panel"><h2>Contract SLA exceptions ({at.length})</h2>{at.length ? <div className="data-table-wrap"><table className="data-table" data-testid="sla-exceptions"><thead><tr><th>Work order</th><th>Agreement</th><th>Resolution due (contract)</th><th>Status</th></tr></thead><tbody>
        {at.slice(0, 40).map(({ order, sla }) => <tr key={order.id}><td><button className="text-button" onClick={() => onOpenOrder(order.id)}>{order.id}</button><small>{order.description}</small></td><td>{sla.agreementId}<small>{sla.calendarName}</small></td><td>{sla.resolutionDue ? `${shortDate(sla.resolutionDue)} ${time(sla.resolutionDue)}` : "—"}</td><td><Status value={sla.resolution} /></td></tr>)}
      </tbody></table></div> : <p>No open work order is at risk or breached under its contract.</p>}</section>
      <section className="panel"><h2>Agreements ({state.agreements.length})</h2><div className="data-table-wrap"><table className="data-table" data-testid="agreement-table"><thead><tr><th>Agreement</th><th>Customer</th><th>Tier</th><th>Critical response / resolution</th><th>Coverage</th></tr></thead><tbody>
        {state.agreements.slice(0, 60).map((agreement) => <tr key={agreement.id}><td><strong>{agreement.name}</strong><small>{agreement.id} · {state.calendars.find((calendar) => calendar.id === agreement.calendarId)?.name}</small></td><td>{state.customers.find((customer) => customer.id === agreement.customerId)?.name}</td><td>{agreement.tier}</td><td>{agreement.responseMinutes.CRITICAL / 60} h / {agreement.resolutionMinutes.CRITICAL / 60} h business</td><td>{shortDate(agreement.coverageStart)}–{shortDate(agreement.coverageEnd)}</td></tr>)}
      </tbody></table></div>{state.agreements.length > 60 && <p>Showing 60 of {state.agreements.length}.</p>}</section>
    </>
  );
}

export function FinancialsView({ state, commit, onOpenOrder }: ScreenProps) {
  const summary = financeSummary(state);
  const [status, setStatus] = useState<"OPEN" | "ALL" | "PAID">("OPEN");
  const [shown, setShown] = useState(25);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const eligible = state.workOrders.filter((order) => order.status === "CLOSED" && order.financials.invoiceStatus === "ELIGIBLE");
  const invoices = state.invoices.filter((invoice) => status === "ALL" || (status === "PAID" ? invoice.status === "PAID" : invoice.status !== "PAID")).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  function pay(invoiceId: string) {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents)) return commit({ ok: false, error: "Enter a valid dollar amount." });
    commit(recordPayment(state, invoiceId, cents));
    setPayingId(null);
    setAmount("");
  }
  return (
    <>
      <PageTitle title="Financials" body="Invoiced revenue and cash received are tracked separately. All amounts are synthetic, held in integer cents." />
      <section className="kpi-rail" aria-label="Financial summary">
        <Kpi label="Invoiced" value={money(summary.invoicedCents)} detail={`${state.invoices.length} invoices`} icon={FileText} />
        <Kpi label="Cash received" value={money(summary.cashReceivedCents)} detail="recorded payments" icon={CircleDollarSign} />
        <Kpi label="Outstanding" value={money(summary.outstandingCents)} detail={`${money(summary.overdueCents)} overdue`} icon={Clock3} />
        <Kpi label="Awaiting invoice" value={String(summary.awaitingInvoiceCount)} detail={money(summary.awaitingInvoiceCents)} icon={Receipt} />
      </section>
      <section className="panel"><h2>Closed work awaiting invoice ({eligible.length})</h2>{eligible.length ? <ul className="plain-list" data-testid="awaiting-invoice">{eligible.slice(0, 15).map((order) => <li key={order.id}><button className="text-button" onClick={() => onOpenOrder(order.id)}>{order.id}</button> {state.customers.find((customer) => customer.id === order.customerId)?.name} · {money(order.financials.recognizedRevenueCents)} <button className="secondary-button" data-testid={`invoice-${order.id}`} onClick={() => commit(generateInvoice(state, order.id))}><FileText /> Generate invoice</button></li>)}</ul> : <p>Every closed, eligible job has an invoice.</p>}</section>
      <section className="panel">
        <div className="filters-row"><h2>Invoices</h2><select aria-label="Filter invoices" value={status} onChange={(event) => { setStatus(event.target.value as "OPEN" | "ALL" | "PAID"); setShown(25); }}><option value="OPEN">Unpaid / partial</option><option value="PAID">Paid</option><option value="ALL">All</option></select><span className="result-count">{invoices.length} invoices</span></div>
        <div className="data-table-wrap"><table className="data-table" data-testid="invoice-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Issued / due</th><th>Total</th><th>Paid</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {invoices.slice(0, shown).map((invoice) => {
            const overdue = invoice.status !== "PAID" && Date.parse(invoice.dueAt) < Date.parse(state.now);
            return <tr key={invoice.id}><td><strong>{invoice.id}</strong><small>{invoice.workOrderId}</small></td><td>{state.customers.find((customer) => customer.id === invoice.customerId)?.name}</td><td>{shortDate(invoice.issuedAt)}<small className={overdue ? "danger-text" : ""}>due {shortDate(invoice.dueAt)}{overdue ? " · overdue" : ""}</small></td><td>{money(invoice.totalCents)}</td><td>{money(invoice.paidCents)}</td><td><Status value={invoice.status} /></td><td>{invoice.status !== "PAID" && (payingId === invoice.id ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); pay(invoice.id); }}><label className="sr-only" htmlFor={`pay-${invoice.id}`}>Payment amount in dollars</label><input id={`pay-${invoice.id}`} data-testid="payment-amount" type="number" step="0.01" min="0.01" max={(invoice.totalCents - invoice.paidCents) / 100} required value={amount} onChange={(event) => setAmount(event.target.value)} /><button className="primary-button" data-testid="confirm-payment" type="submit">Record</button><button type="button" className="text-button" aria-label="Cancel payment" onClick={() => setPayingId(null)}><X /></button></form> : <button className="secondary-button" data-testid={`pay-${invoice.id}`} onClick={() => { setPayingId(invoice.id); setAmount(((invoice.totalCents - invoice.paidCents) / 100).toFixed(2)); }}>Record payment</button>)}</td></tr>;
          })}
        </tbody></table></div>
        <MoreButton shown={shown} total={invoices.length} onMore={() => setShown(shown + 25)} />
      </section>
    </>
  );
}

export function AutomationView({ state, commit }: ScreenProps) {
  const proposals = useMemo(() => proposeAutomations(state), [state]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  function decide(proposal: AutomationProposal, approve: boolean) {
    commit(approve ? executeAutomation(state, proposal) : declineAutomation(state, proposal));
    setPreviewKey(null);
  }
  return (
    <>
      <PageTitle title="Automation Center" body="Deterministic threshold rules. Each proposal is previewed and needs your approval; every decision writes a receipt." />
      <section className="panel"><h2>Rules</h2><ul className="plain-list">{automationRules.map((rule) => <li key={rule.id}><b>{rule.name}</b> ({rule.id}) · when {rule.trigger.toLowerCase()} → {rule.action.toLowerCase()}</li>)}</ul></section>
      <section className="panel"><h2>Proposals ({proposals.length})</h2>
        {proposals.length ? <ul className="proposal-list" data-testid="automation-proposals">{proposals.map((proposal) => (
          <li key={proposal.key}>
            <div><Zap aria-hidden="true" /><strong>{proposal.title}</strong><small>{proposal.ruleId} · {proposal.targetId}</small></div>
            {previewKey === proposal.key ? (
              <div className="proposal-preview" data-testid="automation-preview"><strong>Exact changes</strong><ul>{proposal.preview.map((line) => <li key={line}>{line}</li>)}</ul>
                <button className="primary-button" data-testid="approve-automation" onClick={() => decide(proposal, true)}><Check /> Approve &amp; execute</button>
                <button className="secondary-button" data-testid="decline-automation" onClick={() => decide(proposal, false)}><X /> Decline</button></div>
            ) : <button className="secondary-button" data-testid="preview-automation" onClick={() => setPreviewKey(proposal.key)}><ClipboardCheck /> Preview</button>}
          </li>
        ))}</ul> : <EmptyState title="No proposals" body="No rule trigger currently holds." />}
      </section>
      <section className="panel"><h2>Receipts ({state.automationReceipts.length})</h2>{state.automationReceipts.length ? <ul className="plain-list" data-testid="automation-receipts">{state.automationReceipts.slice().reverse().slice(0, 30).map((receipt) => <li key={receipt.id}><b>{receipt.decision}</b> · {receipt.ruleId} · {shortDate(receipt.timestamp)} {time(receipt.timestamp)} · {receipt.summary}</li>)}</ul> : <p>No decisions yet.</p>}</section>
    </>
  );
}

export function InventoryView({ state, onOpenOrder }: ScreenProps) {
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState<"ALL" | "SHORTAGE" | "REORDER_REVIEW" | "HEALTHY">("ALL");
  const [warehouse, setWarehouse] = useState("ALL");
  const [shown, setShown] = useState(30);
  const [selectedSku, setSelectedSku] = useState("CR-440");
  const warehouses = [...new Set(state.inventory.map((item) => item.warehouse))].sort();
  const status = (item: OperationalState["inventory"][number]) => { const available = availableQuantity(item); return available <= 0 ? "SHORTAGE" : available <= item.reorderPoint ? "REORDER_REVIEW" : "HEALTHY"; };
  const items = state.inventory.filter((item) => (warehouse === "ALL" || item.warehouse === warehouse) && (health === "ALL" || status(item) === health) && `${item.sku} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => availableQuantity(a) - availableQuantity(b));
  const selected = state.inventory.find((item) => item.sku === selectedSku);
  const usage = selected ? state.workOrders.filter((order) => order.consumedParts.some((part) => part.sku === selected.sku)).length : 0;
  return (
    <>
      <PageTitle title="Inventory & parts" body="On-hand, reservation, availability, reorder exposure, and service usage."><span className="definition-chip">Available = on-hand − reserved</span></PageTitle>
      <div className="split-layout">
        <section className="panel inventory-panel">
          <div className="filters-row">
            <label className="search-field"><Search /><span className="sr-only">Search parts</span><input data-testid="inventory-search" value={query} onChange={(event) => { setQuery(event.target.value); setShown(30); }} placeholder="Search SKU or description" /></label>
            <select aria-label="Filter by stock health" data-testid="inventory-health" value={health} onChange={(event) => setHealth(event.target.value as typeof health)}><option value="ALL">All stock</option><option value="SHORTAGE">Shortage</option><option value="REORDER_REVIEW">Reorder review</option><option value="HEALTHY">Healthy</option></select>
            <select aria-label="Filter by warehouse" value={warehouse} onChange={(event) => setWarehouse(event.target.value)}><option value="ALL">All warehouses</option>{warehouses.map((name) => <option key={name}>{name}</option>)}</select>
            <span className="result-count">{items.length} SKUs</span>
          </div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>SKU</th><th>Description</th><th>Warehouse</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder point</th><th>Status</th></tr></thead><tbody>
            {items.slice(0, shown).map((item) => {
              const reserved = Object.values(item.reservedBy).reduce((sum, quantity) => sum + quantity, 0);
              return <tr key={item.sku} className={item.sku === selectedSku ? "selected-row" : ""} onClick={() => setSelectedSku(item.sku)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedSku(item.sku); }}><td className="link-cell">{item.sku}</td><td><strong>{item.description}</strong><small>{item.category}</small></td><td>{item.warehouse}</td><td>{item.onHand}</td><td>{reserved}</td><td><strong>{availableQuantity(item)}</strong></td><td>{item.reorderPoint}</td><td><Status value={status(item)} /></td></tr>;
            })}
          </tbody></table></div>
          <MoreButton shown={shown} total={items.length} onMore={() => setShown(shown + 25)} />
        </section>
        {selected && (
          <section className="panel detail-panel" data-testid="inventory-detail">
            <h2>{selected.sku} · {selected.description}</h2><p>{selected.category} · {selected.warehouse} · cost {money(selected.unitCostCents)} · price {money(selected.unitPriceCents)} · used on {usage} work order(s)</p>
            <h3>Reservations</h3>{Object.keys(selected.reservedBy).length ? <ul className="plain-list">{Object.entries(selected.reservedBy).map(([id, quantity]) => <li key={id}><button className="text-button" onClick={() => onOpenOrder(id)}>{id}</button> · {quantity} unit(s)</li>)}</ul> : <p>No reservations.</p>}
            <h3>Compatible equipment</h3><div className="chip-list">{selected.compatibleAssetTypes.map((type) => <span key={type}>{type}</span>)}</div>
          </section>
        )}
      </div>
    </>
  );
}

export function ActivityView({ state }: ScreenProps) {
  const [type, setType] = useState("ALL");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(40);
  const types = [...new Set(state.audit.map((event) => event.type))].sort();
  const events = state.audit.filter((event) => (type === "ALL" || event.type === type) && `${event.entityId} ${event.actor} ${event.detail}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageTitle title="Activity & audit" body="Append-only receipts for every state-changing demo command."><span className="definition-chip">{state.audit.length.toLocaleString()} events</span></PageTitle>
      <section className="panel">
        <div className="filters-row">
          <label className="search-field"><Search /><span className="sr-only">Search audit events</span><input data-testid="audit-search" value={query} onChange={(event) => { setQuery(event.target.value); setShown(40); }} placeholder="Entity, actor, or detail" /></label>
          <select aria-label="Filter by event type" data-testid="audit-type" value={type} onChange={(event) => { setType(event.target.value); setShown(40); }}><option value="ALL">All event types</option>{types.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
          <span className="result-count" data-testid="audit-count">{events.length.toLocaleString()} events</span>
        </div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Time (ET)</th><th>Event</th><th>Entity</th><th>Actor</th><th>Detail</th></tr></thead><tbody>
          {events.slice(0, shown).map((event) => <tr key={event.id}><td>{shortDate(event.timestamp)}<small>{time(event.timestamp)}</small></td><td>{label(event.type)}</td><td>{event.entityId}</td><td>{event.actor}</td><td>{event.detail}</td></tr>)}
        </tbody></table></div>
        <MoreButton shown={shown} total={events.length} onMore={() => setShown(shown + 25)} />
      </section>
    </>
  );
}

