"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Plus,
  Zap,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Command,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Menu,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { proposeRecovery } from "@/domain/planning";
import { createWorkOrder, type NewWorkOrderInput } from "@/domain/intake";
import { generateInvoice } from "@/domain/finance";
import { contractSla } from "@/domain/sla";
import { useEffect, useMemo, useState } from "react";
import { ActivityView, AgreementsView, AssetsView, AutomationView, CustomersView, FinancialsView, InventoryView, SchedulingView, TechniciansView } from "./screens";
import { EmptyState, Kpi, label, PriorityTag, shortDate, Status, time } from "./ui";
import {
  assignWorkOrder,
  availableQuantity,
  createScenario,
  RESOLUTION_CODES,
  type CompletionInput,
  recommendTechnicians,
  reserveRequiredParts,
  scenarioCatalog,
  technicianName,
  transitionWorkOrder,
  type ScenarioId,
} from "@/domain/operations";
import { calculateMetrics, filterByRegion, formatCurrency, metricDefinitions, weeklyFirstTimeFix } from "@/domain/metrics";
import { createSeedSession } from "@/domain/seed";
import { loadSessionWithOutcome, saveSession } from "@/domain/session";
import type {
  DemoSession,
  OperationalState,
  OperationResult,
  Region,
  Priority,
  WorkOrder,
  WorkOrderStatus,
} from "@/domain/types";

type View =
  | "Overview"
  | "Work Orders"
  | "Dispatch"
  | "Scheduling"
  | "Technicians"
  | "Customers"
  | "Assets"
  | "Agreements"
  | "Inventory"
  | "Financials"
  | "Automation"
  | "Scenario Lab"
  | "Analytics"
  | "Activity"
  | "Portfolio";

const navItems = [
  { label: "Overview" as const, icon: LayoutDashboard },
  { label: "Work Orders" as const, icon: FileText },
  { label: "Dispatch" as const, icon: Truck },
  { label: "Scheduling" as const, icon: CalendarDays },
  { label: "Technicians" as const, icon: Users },
  { label: "Customers" as const, icon: Building2 },
  { label: "Assets" as const, icon: Wrench },
  { label: "Agreements" as const, icon: ShieldCheck },
  { label: "Inventory" as const, icon: Boxes },
  { label: "Financials" as const, icon: CircleDollarSign },
  { label: "Automation" as const, icon: Zap },
  { label: "Scenario Lab" as const, icon: FlaskConical },
  { label: "Analytics" as const, icon: BarChart3 },
  { label: "Activity" as const, icon: Activity },
  { label: "Portfolio" as const, icon: Archive },
];

type OrderFilter = "ALL" | "OPEN" | "CRITICAL" | "SLA_RISK" | "OVERDUE" | "CLOSED";
const orderFilterLabels: Record<OrderFilter, string> = { ALL: "All statuses", OPEN: "Open", CRITICAL: "Open critical", SLA_RISK: "SLA risk (≤4 h)", OVERDUE: "Past resolution due", CLOSED: "Closed" };
function matchesFilter(order: WorkOrder, filter: OrderFilter, now: number) {
  const open = order.status !== "CLOSED" && order.status !== "CANCELLED";
  const due = Date.parse(order.slaResolutionDue);
  switch (filter) {
    case "ALL": return true;
    case "OPEN": return open;
    case "CRITICAL": return open && order.priority === "CRITICAL";
    case "SLA_RISK": return open && due >= now && due - now <= 4 * 3_600_000;
    case "OVERDUE": return open && due < now;
    case "CLOSED": return order.status === "CLOSED";
  }
}

const nextStatus: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
  REQUESTED: "TRIAGED",
  TRIAGED: "APPROVED",
  APPROVED: "READY_TO_SCHEDULE",
  WAITING_FOR_CUSTOMER: "IN_PROGRESS",
  SCHEDULED: "DISPATCHED",
  DISPATCHED: "IN_PROGRESS",
  IN_PROGRESS: "WORK_COMPLETED",
  WORK_COMPLETED: "QUALITY_REVIEW",
  QUALITY_REVIEW: "CLOSED",
};

function DispatchTimeline({ state }: { state: OperationalState }) {
  const dayStart = Date.parse(state.now) - 2 * 3_600_000;
  const span = 11 * 3_600_000;
  const pct = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - dayStart) / span) * 100));
  const technicians = state.technicians
    .filter((technician) => technician.assignments.length > 0 || technician.status === "AVAILABLE")
    .slice(0, 6);
  return (
    <section className="panel dispatch-panel" aria-labelledby="dispatch-title">
      <div className="panel-heading">
        <div>
          <span className="heading-icon"><CalendarDays /></span>
          <div>
            <h2 id="dispatch-title">Today&apos;s dispatch</h2>
            <p>Mon, Oct 26 · Eastern time</p>
          </div>
        </div>
        <span className="quiet-action">7 AM — 6 PM</span>
      </div>
      <div className="timeline-grid">
        <div className="timeline-hours" aria-hidden="true">
          <span />
          {[7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5].map((hour) => <span key={hour}>{hour} {hour < 7 || hour === 12 ? "PM" : "AM"}</span>)}
        </div>
        {technicians.map((technician, rowIndex) => (
          <div className="timeline-row" key={technician.id}>
            <div className="tech-cell">
              <span className="avatar">{technician.name.split(" ").map((part) => part[0]).join("")}</span>
              <div><strong>{technician.name}</strong><small>{technician.region} · {label(technician.status)}</small></div>
            </div>
            <div className="timeline-track">
              {technician.assignments.filter((assignment) => pct(assignment.end) > 0 && pct(assignment.start) < 100).map((assignment, index) => (
                <div
                  className={`job-block tone-${(rowIndex + index) % 3}`}
                  key={assignment.workOrderId}
                  style={{ left: `${pct(assignment.start)}%`, width: `${Math.max(4, pct(assignment.end) - pct(assignment.start))}%` }}
                >
                  <strong>{assignment.workOrderId}</strong>
                  <span>{time(assignment.start)}–{time(assignment.end)}</span>
                </div>
              ))}
              {technician.assignments.length === 0 && <span className="available-slot">Available capacity</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityRail({ state, limit = 7 }: { state: OperationalState; limit?: number }) {
  return (
    <section className="panel activity-rail" aria-labelledby="activity-title">
      <div className="panel-heading compact-heading">
        <div><span className="heading-icon"><History /></span><h2 id="activity-title">Daily activity</h2></div>
        <span className="live-dot">Audit-backed</span>
      </div>
      <div className="activity-list">
        {state.audit.slice(0, limit).map((event, index) => (
          <div className="activity-item" key={event.id}>
            <span className={`activity-node node-${index % 4}`} />
            <time>{time(event.timestamp)}</time>
            <div><strong>{label(event.type)}</strong><p>{event.entityId} · {event.detail}</p><small>{event.actor}</small></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewView({
  state: fullState,
  onOpenOrder,
  onDrill,
}: {
  state: OperationalState;
  onOpenOrder: (id: string) => void;
  onDrill: (filter: OrderFilter) => void;
}) {
  const [region, setRegion] = useState<"ALL" | Region>("ALL");
  const state = useMemo(() => filterByRegion(fullState, region), [fullState, region]);
  const metrics = calculateMetrics(state);
  const trend = weeklyFirstTimeFix(state);
  const points = trend.map((week, index) => ({ ...week, x: (index / (trend.length - 1)) * 800, y: week.rate === null ? null : 160 - (week.rate / 100) * 160 }));
  const drawn = points.filter((point): point is typeof point & { y: number } => point.y !== null);
  const line = drawn.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(0)} ${point.y.toFixed(0)}`).join(" ");
  const rates = trend.filter((week) => week.rate !== null).map((week) => (week.rate ?? 0).toFixed(0));
  const attention = state.workOrders
    .filter((order) => order.status !== "CLOSED" && order.status !== "CANCELLED")
    .sort((a, b) => {
      if (a.id === "WO-10483") return -1;
      if (b.id === "WO-10483") return 1;
      const weights = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return weights[b.priority] - weights[a.priority] || Date.parse(a.slaResolutionDue) - Date.parse(b.slaResolutionDue);
    })
    .slice(0, 5);
  return (
    <>
      <div className="page-title-row"><div><h1>Operations overview</h1><p>Live state of the synthetic Northstar demo{region === "ALL" ? " across all regions" : ` · ${region} region`}.</p></div>
        <select aria-label="Filter overview by region" data-testid="region-filter" value={region} onChange={(event) => setRegion(event.target.value as "ALL" | Region)}><option value="ALL">All regions</option><option>East</option><option>Central</option><option>West</option></select>
      </div>
      <section className="kpi-rail" aria-label="Operational KPIs">
        <Kpi label="Open work orders" value={String(metrics.openWorkOrders)} detail={`${metrics.urgentWorkOrders} critical`} icon={FileText} onClick={() => onDrill("OPEN")} testId="kpi-open" />
        <Kpi label="SLA risk" value={String(metrics.slaRisk)} detail={`${metrics.overdueJobs} overdue`} icon={AlertTriangle} onClick={() => onDrill("SLA_RISK")} testId="kpi-sla" />
        <Kpi label="Technicians available" value={String(metrics.techniciansAvailable)} detail={`${metrics.techniciansAssigned} with assignments`} icon={Users} />
        <Kpi label="First-time fix" value={`${metrics.firstTimeFixRate.toFixed(0)}%`} detail="eligible closed jobs" icon={Wrench} />
        <Kpi label="Estimated revenue" value={formatCurrency(metrics.estimatedRevenueCents)} detail={`${formatCurrency(metrics.recognizedRevenueCents)} recognized`} icon={CircleDollarSign} />
      </section>
      <div className="overview-layout">
        <div className="overview-main">
          <section className="panel attention-panel">
            <div className="panel-heading">
              <div><span className="heading-icon danger"><AlertTriangle /></span><div><h2>Attention queue</h2><p>Highest-impact operational exceptions</p></div></div>
              <button className="text-button" onClick={() => onDrill("OPEN")}>View open work orders <ArrowRight /></button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Priority</th><th>Issue</th><th>Work order</th><th>Status</th><th>Resolution due</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {attention.map((order, index) => (
                    <tr key={order.id} className={index === 0 ? "selected-row" : ""} onClick={() => onOpenOrder(order.id)}>
                      <td><PriorityTag value={order.priority} /></td>
                      <td><strong>{order.description}</strong><small>{state.customers.find((customer) => customer.id === order.customerId)?.name}</small></td>
                      <td className="link-cell">{order.id}</td>
                      <td><Status value={order.status} /></td>
                      <td className={Date.parse(order.slaResolutionDue) <= Date.parse(state.now) ? "danger-text" : "warn-text"}>{shortDate(order.slaResolutionDue)} · {time(order.slaResolutionDue)}</td>
                      <td><ChevronRight aria-hidden="true" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <DispatchTimeline state={state} />
          <section className="panel performance-panel">
            <div className="panel-heading">
              <div><span className="heading-icon"><BarChart3 /></span><div><h2>Service performance</h2><p>Weekly first-time fix from closed jobs, trailing eight weeks</p></div></div>
              <span className="metric-highlight">{metrics.firstTimeFixRate.toFixed(1)}%</span>
            </div>
            {drawn.length ? <div className="chart-area" role="img" aria-label={`Weekly first-time fix rate over the last ${trend.length} weeks: ${rates.join(", ")} percent`}>
              <div className="y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div>
              <svg viewBox="0 0 800 160" preserveAspectRatio="none" aria-hidden="true">
                <path d={line} fill="none" stroke="#25d2f4" strokeWidth="3"/>
                {drawn.map((point) => <circle key={point.x} cx={point.x} cy={point.y} r="5" fill="#071521" stroke="#25d2f4" strokeWidth="3"/>)}
              </svg>
              <div className="x-labels">{trend.filter((_, index) => index % 2 === 1).map((week) => <span key={week.weekEnding}>{shortDate(week.weekEnding)}</span>)}</div>
            </div> : <EmptyState title="No closed jobs in range" body="Weekly first-time fix appears once jobs close in this region." />}
          </section>
        </div>
        <ActivityRail state={state} />
      </div>
    </>
  );
}

function WorkOrderDetail({
  state,
  order,
  proposalOpen,
  onPreview,
  onApprove,
  onReserve,
  onAdvance,
  onCancel,
  onInvoice,
}: {
  onCancel: () => void;
  onInvoice: () => void;
  state: OperationalState;
  order: WorkOrder;
  proposalOpen: boolean;
  onPreview: () => void;
  onApprove: (technicianId: string) => void;
  onReserve: () => void;
  onAdvance: (completion?: CompletionInput) => void;
}) {
  const [labor, setLabor] = useState(String(order.estimatedDurationMinutes));
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState<CompletionInput["resolutionCode"]>("REPAIRED");
  const customer = state.customers.find((item) => item.id === order.customerId);
  const location = state.locations.find((item) => item.id === order.locationId);
  const asset = state.assets.find((item) => item.id === order.assetId);
  const recommendations = recommendTechnicians(state, order.id).slice(0, 4);
  const best = recommendations.find((item) => item.feasible);
  const isReserved = order.requiredParts.length > 0 && order.requiredParts.every((requirement) => {
    const item = state.inventory.find((candidate) => candidate.sku === requirement.sku);
    return (item?.reservedBy[order.id] ?? 0) >= requirement.quantity;
  });
  const advance = order.status === "WAITING_FOR_PARTS" ? (order.assignedTechnicianId ? "IN_PROGRESS" : "READY_TO_SCHEDULE") : nextStatus[order.status];
  const sla = contractSla(state, order);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancellable = ["REQUESTED", "TRIAGED", "APPROVED", "READY_TO_SCHEDULE", "SCHEDULED", "WAITING_FOR_CUSTOMER", "WAITING_FOR_PARTS"].includes(order.status);
  return (
    <aside className="work-order-detail" aria-label={`Work order ${order.id} details`}>
      <div className="detail-header">
        <div><div className="detail-id-row"><h2>{order.id}</h2><PriorityTag value={order.priority} /></div><p>{label(order.status)} · created {shortDate(order.createdAt)} at {time(order.createdAt)}</p></div>
        <Status value={order.status} />
      </div>
      <div className="detail-scroll">
        <section className="detail-summary">
          <div><small>Customer</small><strong>{customer?.name}</strong><span>{location?.name} · {location?.region}</span></div>
          <div><small>Asset</small><strong>{asset?.category} · {asset?.model}</strong><span>{asset?.manufacturer} · {asset?.serialNumber}</span></div>
          <div className="sla-box"><small>SLA resolution due</small><strong>{time(order.slaResolutionDue)}</strong><span>{shortDate(order.slaResolutionDue)} · response tracked separately</span><span data-testid="contract-sla">{sla.agreementId ? `Contract ${sla.agreementId}: resolution ${label(sla.resolution)}${sla.resolutionDue ? ` (due ${shortDate(sla.resolutionDue)} ${time(sla.resolutionDue)}, ${sla.calendarName})` : ""}` : "No service agreement covers this job"}</span></div>
        </section>
        <div className="requirements-grid">
          <section><small>Required skills</small>{order.requiredSkills.map((skill) => <strong key={skill}><Check /> {skill}</strong>)}{order.requiredCertifications.map((cert) => <strong key={cert}><ShieldCheck /> {cert}</strong>)}</section>
          <section><small>Required parts</small>{order.requiredParts.length ? order.requiredParts.map((part) => {
            const item = state.inventory.find((candidate) => candidate.sku === part.sku);
            return <div key={part.sku}><strong><PackageCheck /> {part.sku}</strong><span>{item?.description} · {availableQuantity(item!)} available</span><em>{(item?.reservedBy[order.id] ?? 0) ? "Reserved" : "Not reserved"}</em></div>;
          }) : <span>No parts required</span>}</section>
          <section><small>Appointment</small><strong><CalendarDays /> {shortDate(order.appointmentStart)}</strong><span>{time(order.appointmentStart)}–{time(order.appointmentEnd)}</span></section>
        </div>
        {order.status === "READY_TO_SCHEDULE" && (
          <section className="recommendation-card">
            <div className="section-title"><div><Sparkles /><div><h3>Assignment recommendation</h3><p>Feasible heuristic · hard constraints first</p></div></div><span>Explainable</span></div>
            {best ? (
              <div className="best-match">
                <div className="match-top"><div><span className="avatar accent-avatar">{best.technicianName.split(" ").map((part) => part[0]).join("")}</span><div><strong>Recommend {best.technicianName} ({best.technicianId})</strong><small>{best.reasons.join(" · ")}</small></div></div><span className="best-label">Best feasible</span></div>
                <div className="reason-grid"><span><ShieldCheck /> Qualification match</span><span><Clock3 /> Window available</span><span><Truck /> {best.travelMinutes} min estimated travel</span><span><PackageCheck /> {order.requiredParts.length ? (best.reasons.includes("Required part is ready") ? "Parts available" : "Parts not available") : "No parts required"}</span></div>
              </div>
            ) : <EmptyState title="No feasible assignment" body="Review qualification, availability, appointment, and parts constraints." />}
            <div className="alternatives">
              {recommendations.filter((item) => item.technicianId !== best?.technicianId).slice(0, 3).map((item) => (
                <div key={item.technicianId}><strong>{item.technicianName} ({item.technicianId})</strong><span>{item.feasible ? item.reasons.join(" · ") : item.blockers.join(" · ")}</span></div>
              ))}
            </div>
            {proposalOpen && best && (
              <div className="proposal-preview" data-testid="assignment-preview">
                <div><strong>Review exact change</strong><p>Assign {best.technicianName} to {order.id} at {time(order.appointmentStart)}. This adds one schedule block; inventory is unchanged until you reserve parts.</p></div>
                <button className="primary-button" data-testid="approve-assignment" onClick={() => onApprove(best.technicianId)}><Check /> Approve assignment</button>
              </div>
            )}
            {!proposalOpen && best && <button className="primary-button full-button" data-testid="preview-assignment" onClick={onPreview}><ClipboardCheck /> Preview assignment</button>}
          </section>
        )}
        {order.status !== "READY_TO_SCHEDULE" && order.status !== "CLOSED" && order.status !== "CANCELLED" && (
          <section className="execution-card">
            <div className="section-title"><div><Wrench /><div><h3>Service execution</h3><p>Assigned to {technicianName(state, order.assignedTechnicianId)}</p></div></div><Status value={order.status} /></div>
            <div className="execution-actions">
              {!isReserved && order.requiredParts.length > 0 && order.consumedParts.length === 0 && (
                <button className="secondary-button" data-testid="reserve-parts" onClick={onReserve}><PackageCheck /> Reserve required part</button>
              )}
              {isReserved && <span className="success-note"><Check /> Parts reserved and dispatch-ready</span>}
              {advance === "WORK_COMPLETED" && (
                <form className="completion-form" aria-label="Completion record" onSubmit={(event) => { event.preventDefault(); onAdvance({ actualLaborMinutes: Number(labor), completionNotes: notes, resolutionCode: resolution }); }}>
                  <label>Actual labor (minutes)<input data-testid="completion-labor" type="number" min={1} max={960} required value={labor} onChange={(event) => setLabor(event.target.value)} /></label>
                  <label>Resolution code<select data-testid="completion-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as CompletionInput["resolutionCode"])}>{RESOLUTION_CODES.map((code) => <option key={code} value={code}>{label(code)}</option>)}</select></label>
                  <label className="completion-notes">Completion notes<textarea data-testid="completion-notes" required minLength={10} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was found, what was done, how it was verified" /></label>
                  <button className="primary-button" data-testid="advance-status" type="submit">Complete &amp; consume parts <ArrowRight /></button>
                </form>
              )}
              {advance && advance !== "WORK_COMPLETED" && (
                <button className="primary-button" data-testid="advance-status" onClick={() => onAdvance()}>
                  {`Move to ${label(advance)}`} <ArrowRight />
                </button>
              )}
            </div>
          </section>
        )}
        {order.status === "CLOSED" && (
          <section className="closed-receipt">
            <Check /><div><h3>Service job closed</h3><p>Part usage, asset history, operational KPIs, audit history, and financial eligibility are updated.</p><p data-testid="completion-summary">{label(order.resolutionCode ?? "")} · {order.actualLaborMinutes} min labor · {order.completionNotes}</p><strong>{formatCurrency(order.financials.recognizedRevenueCents)} recognized service revenue · invoice {label(order.financials.invoiceStatus)}</strong>{order.financials.invoiceStatus === "ELIGIBLE" && <button className="secondary-button" data-testid="generate-invoice" onClick={onInvoice}><FileText /> Generate invoice</button>}</div>
          </section>
        )}
        {order.status === "CANCELLED" && <section className="closed-receipt"><X /><div><h3>Work order cancelled</h3><p>Assignments and part reservations were released. The audit trail keeps the record.</p></div></section>}
        {cancellable && (
          <section className="cancel-zone">
            {confirmCancel ? <><p>Cancel {order.id}? This releases any assignment and reservations and cannot be undone in this session.</p><button className="danger-button" data-testid="confirm-cancel" onClick={onCancel}>Confirm cancellation</button><button className="text-button" onClick={() => setConfirmCancel(false)}>Keep work order</button></> : <button className="text-button" data-testid="cancel-work-order" onClick={() => setConfirmCancel(true)}><X /> Cancel work order</button>}
          </section>
        )}
        <section className="lifecycle">
          <h3>Work-order lifecycle</h3>
          <div className="lifecycle-track">
            {["REQUESTED", "TRIAGED", "APPROVED", "READY_TO_SCHEDULE", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "WORK_COMPLETED", "QUALITY_REVIEW", "CLOSED"].map((status) => {
              const orderIndex = ["REQUESTED", "TRIAGED", "APPROVED", "READY_TO_SCHEDULE", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "WORK_COMPLETED", "QUALITY_REVIEW", "CLOSED"].indexOf(order.status);
              const index = ["REQUESTED", "TRIAGED", "APPROVED", "READY_TO_SCHEDULE", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "WORK_COMPLETED", "QUALITY_REVIEW", "CLOSED"].indexOf(status);
              return <div className={index <= orderIndex ? "complete-step" : ""} key={status}><span>{index < orderIndex ? <Check /> : index + 1}</span><small>{label(status)}</small></div>;
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}

function NewWorkOrderForm({ state, onSubmit, onCancel }: { state: OperationalState; onSubmit: (input: NewWorkOrderInput) => void; onCancel: () => void }) {
  const [customerId, setCustomerId] = useState(state.customers[0]?.id ?? "");
  const assets = state.assets.filter((asset) => asset.customerId === customerId);
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [category, setCategory] = useState<NewWorkOrderInput["category"]>("Corrective maintenance");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("120");
  return (
    <form className="panel new-order-form" aria-label="New work order" data-testid="new-work-order-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ customerId, assetId, priority, category, description, estimatedDurationMinutes: Number(duration) }); }}>
      <label>Customer<select data-testid="new-customer" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setAssetId(state.assets.find((asset) => asset.customerId === event.target.value)?.id ?? ""); }}>{state.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label>Asset<select data-testid="new-asset" required value={assetId} onChange={(event) => setAssetId(event.target.value)}>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} · {asset.category} · {asset.model}</option>)}</select></label>
      <label>Priority<select data-testid="new-priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
      <label>Type<select value={category} onChange={(event) => setCategory(event.target.value as NewWorkOrderInput["category"])}><option>Corrective maintenance</option><option>Preventive maintenance</option></select></label>
      <label>Estimated minutes<input type="number" min={30} max={480} required value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
      <label className="wide-field">Problem description<input data-testid="new-description" required minLength={8} maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is the customer reporting?" /></label>
      <div className="form-actions"><button className="primary-button" type="submit" data-testid="create-work-order"><Check /> Create work order</button><button className="text-button" type="button" onClick={onCancel}>Cancel</button></div>
      <small>SLA due dates are computed from the customer&apos;s service agreement and business calendar.</small>
    </form>
  );
}

function WorkOrdersView({
  state,
  selectedId,
  setSelectedId,
  updateState,
  notify,
  initialQuery = "",
  initialFilter = "ALL",
}: {
  initialQuery?: string;
  initialFilter?: OrderFilter;
  state: OperationalState;
  selectedId: string;
  setSelectedId: (id: string) => void;
  updateState: (state: OperationalState) => void;
  notify: (message: string, tone?: "success" | "error") => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [priority, setPriority] = useState("ALL");
  const [filter, setFilter] = useState<OrderFilter>(initialFilter);
  const [shown, setShown] = useState(20);
  const [creating, setCreating] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const now = Date.parse(state.now);
  const orders = state.workOrders
    .filter((order) => {
      const customer = state.customers.find((item) => item.id === order.customerId)?.name ?? "";
      return `${order.id} ${order.description} ${customer}`.toLowerCase().includes(query.toLowerCase()) && (priority === "ALL" || order.priority === priority) && matchesFilter(order, filter, now);
    })
    .sort((a, b) => Number(b.id === "WO-10483") - Number(a.id === "WO-10483") || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const selected = state.workOrders.find((order) => order.id === selectedId) ?? orders[0];
  function apply(result: ReturnType<typeof assignWorkOrder>) {
    if (result.ok) {
      updateState(result.state);
      notify(result.message);
      setProposalOpen(false);
    } else notify(result.error, "error");
  }
  return (
    <div className="work-orders-screen">
      <div className="work-orders-list">
        <div className="page-title-row">
          <div><h1>Work orders</h1><p>Manage validated service execution across every customer and site.</p></div>
          <button className="primary-button" data-testid="new-work-order" aria-expanded={creating} onClick={() => setCreating(!creating)}><Plus /> New work order</button>
        </div>
        <div className="filters-row">
          <label className="search-field"><Search /><span className="sr-only">Search work orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders, customers, or assets" /></label>
          <select aria-label="Filter by status" data-testid="status-filter" value={filter} onChange={(event) => { setFilter(event.target.value as OrderFilter); setShown(20); }}>{(Object.keys(orderFilterLabels) as OrderFilter[]).map((key) => <option key={key} value={key}>{orderFilterLabels[key]}</option>)}</select>
          <select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="ALL">All priorities</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
          <span className="result-count">{orders.length.toLocaleString()} records</span>
        </div>
        {creating && <NewWorkOrderForm state={state} onCancel={() => setCreating(false)} onSubmit={(input) => { const result = createWorkOrder(state, input); apply(result); if (result.ok) { setCreating(false); setFilter("ALL"); setQuery(""); setSelectedId(result.state.workOrders[0]?.id ?? ""); } }} />}
        <div className="data-table-wrap work-order-table-wrap">
          <table className="data-table work-order-table">
            <thead><tr><th>Work order</th><th>Priority</th><th>Customer / site</th><th>Asset</th><th>Status</th><th>Due</th></tr></thead>
            <tbody>
              {orders.slice(0, shown).map((order) => {
                const customer = state.customers.find((item) => item.id === order.customerId);
                const location = state.locations.find((item) => item.id === order.locationId);
                const asset = state.assets.find((item) => item.id === order.assetId);
                return (
                  <tr key={order.id} data-testid={order.id === "WO-10483" ? "selected-work-order" : undefined} className={selected?.id === order.id ? "selected-row" : ""} onClick={() => { setSelectedId(order.id); setProposalOpen(false); }}>
                    <td><strong className="link-cell">{order.id}</strong><small>{order.description}</small></td>
                    <td><PriorityTag value={order.priority} /></td>
                    <td><strong>{customer?.name}</strong><small>{location?.name}</small></td>
                    <td><strong>{asset?.category}</strong><small>{asset?.model}</small></td>
                    <td><Status value={order.status} /></td>
                    <td className={Date.parse(order.slaResolutionDue) < Date.parse(state.now) && order.status !== "CLOSED" ? "danger-text" : ""}>{shortDate(order.slaResolutionDue)}<small>{time(order.slaResolutionDue)}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {orders.length === 0 && <EmptyState title="No matching work orders" body="Clear the search or filters to see more records." />}
        </div>
        {orders.length > shown && <button className="secondary-button more-button" onClick={() => setShown(shown + 25)}>Show {Math.min(25, orders.length - shown)} more ({orders.length - shown} remaining)</button>}
      </div>
      {selected && (
        <WorkOrderDetail
          key={selected.id}
          state={state}
          order={selected}
          proposalOpen={proposalOpen}
          onPreview={() => setProposalOpen(true)}
          onApprove={(technicianId) => apply(assignWorkOrder(state, selected.id, technicianId))}
          onReserve={() => apply(reserveRequiredParts(state, selected.id))}
          onCancel={() => apply(transitionWorkOrder(state, selected.id, "CANCELLED"))}
          onInvoice={() => apply(generateInvoice(state, selected.id))}
          onAdvance={(completion) => {
            const target = selected.status === "WAITING_FOR_PARTS" ? (selected.assignedTechnicianId ? "IN_PROGRESS" : "READY_TO_SCHEDULE") : nextStatus[selected.status];
            if (target) apply(transitionWorkOrder(state, selected.id, target, completion));
          }}
        />
      )}
    </div>
  );
}

function DispatchView({ state, onOpenOrder }: { state: OperationalState; onOpenOrder: (id: string) => void }) {
  const unscheduled = state.workOrders.filter((order) => order.status === "READY_TO_SCHEDULE").slice(0, 7);
  return (
    <>
      <div className="page-title-row"><div><h1>Dispatch control tower</h1><p>Resource-constrained assignment with visible qualification and availability checks.</p></div></div>
      <div className="dispatch-summary">
        <section className="panel queue-panel">
          <div className="panel-heading"><div><span className="heading-icon"><ClipboardCheck /></span><div><h2>Ready queue</h2><p>{unscheduled.length} highest-priority visible jobs</p></div></div></div>
          <div className="queue-list">
            {unscheduled.map((order) => {
              const recommendation = recommendTechnicians(state, order.id).find((item) => item.feasible);
              return <button key={order.id} onClick={() => onOpenOrder(order.id)}><PriorityTag value={order.priority}/><div><strong>{order.id} · {order.description}</strong><span>{recommendation ? `${recommendation.technicianName} recommended · ${recommendation.travelMinutes} min travel` : "No feasible assignment"}</span></div><ChevronRight /></button>;
            })}
          </div>
        </section>
        <section className="panel constraint-panel">
          <div className="panel-heading"><div><span className="heading-icon"><ShieldCheck /></span><div><h2>Constraint policy</h2><p>Rules applied before efficiency scoring</p></div></div></div>
          <ul className="constraint-list"><li><Check /> Required skill and certification match</li><li><Check /> Shift and appointment window containment</li><li><Check /> No overlapping assignments</li><li><Check /> Technician availability</li><li><Check /> Required parts available</li></ul>
          <p className="policy-note">Feasible candidates are ranked by deterministic travel estimate and current workload. The heuristic makes no global-optimality claim and never changes the schedule without approval.</p>
        </section>
      </div>
      <DispatchTimeline state={state} />
    </>
  );
}

function ScenarioLabView({ session, setSession, notify }: { session: DemoSession; setSession: (session: DemoSession) => void; notify: (message: string) => void }) {
  const active = session.scenario;
  const before = calculateMetrics(active?.baseline ?? session.canonical);
  const after = calculateMetrics(active?.simulated ?? session.canonical);
  const [calloutTech, setCalloutTech] = useState("T-104");
  const busyTechnicians = session.canonical.technicians.filter((technician) => technician.assignments.length > 0);
  const plan = useMemo(
    () => (active && !active.recoveryAccepted ? proposeRecovery(active) : null),
    [active],
  );
  function run(id: ScenarioId) {
    const scenario = createScenario(session.canonical, id, { technicianId: calloutTech });
    setSession({ ...session, scenario });
    notify(`${scenario.title} applied to isolated scenario state.`);
  }
  return (
    <>
      <div className="page-title-row"><div><h1>Scenario Lab</h1><p>Reproducible disruptions applied to an isolated copy of current canonical demo state.</p></div><span className="synthetic-label"><FlaskConical /> Synthetic simulation</span></div>
      <div className="scenario-layout">
        <section className="scenario-catalog" aria-label="Available scenarios">
          <label className="callout-picker">Callout technician<select data-testid="callout-technician" value={calloutTech} onChange={(event) => setCalloutTech(event.target.value)}>{busyTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.id} · {technician.name} ({technician.assignments.length} jobs)</option>)}</select></label>
          {scenarioCatalog.map((scenario, index) => (
            <button key={scenario.id} className={active?.id === scenario.id ? "active-scenario" : ""} data-testid={scenario.id === "technician-callout" ? "scenario-technician-callout" : undefined} onClick={() => run(scenario.id)}>
              <span>0{index + 1}</span><div><strong>{scenario.title}</strong><p>{scenario.summary}</p></div><ChevronRight />
            </button>
          ))}
        </section>
        <section className="scenario-stage">
          {active ? (
            <>
              <div className="scenario-stage-header"><div><small>Active isolated scenario</small><h2>{active.title}</h2><p>{active.assumption}</p></div><button className="secondary-button" data-testid="reset-scenario" onClick={() => { setSession({ ...session, scenario: null }); notify("Scenario reset; canonical demo state preserved."); }}><RefreshCw /> Reset scenario</button></div>
              <div className="comparison-grid">
                <div><small>Open work orders</small><span>{before.openWorkOrders}</span><ArrowRight/><strong>{after.openWorkOrders}</strong><em>{after.openWorkOrders - before.openWorkOrders >= 0 ? "+" : ""}{after.openWorkOrders - before.openWorkOrders}</em></div>
                <div><small>SLA risk</small><span>{before.slaRisk}</span><ArrowRight/><strong>{after.slaRisk}</strong><em>{after.slaRisk - before.slaRisk >= 0 ? "+" : ""}{after.slaRisk - before.slaRisk}</em></div>
                <div><small>Available technicians</small><span>{before.techniciansAvailable}</span><ArrowRight/><strong>{after.techniciansAvailable}</strong><em>{after.techniciansAvailable - before.techniciansAvailable}</em></div>
                <div><small>Impacted records</small><span>0</span><ArrowRight/><strong>{active.impactedWorkOrderIds.length}</strong><em>isolated</em></div>
              </div>
              <div className="explanation-box"><AlertTriangle/><div><strong>Why the metrics changed</strong><p>{active.id === "technician-callout" ? "Removing a scheduled technician returns their jobs to the ready queue and reduces available field capacity. No canonical assignment was changed." : `${active.impactedWorkOrderIds.length} records or resources changed under the declared assumption. Every result is computed from scenario state, not random display values.`}</p></div></div>
              {plan && (
                <div className="recovery-plan" data-testid="recovery-plan">
                  <strong>Proposed recovery · {plan.method}</strong>
                  {plan.steps.length === 0 ? <p>No recovery actions are needed: nothing in this scenario is unassigned or blocked.</p> : <ul>{plan.steps.slice(0, 25).map((step) => <li key={step.workOrderId} className={step.feasible ? "" : "danger-text"}><b>{step.workOrderId}</b> · {step.action}{step.feasible ? " · " : ": "}{step.explanation}</li>)}{plan.steps.length > 25 && <li>+{plan.steps.length - 25} more steps</li>}</ul>}
                  <button className="primary-button" data-testid="accept-recovery" disabled={!plan.steps.some((step) => step.feasible)} onClick={() => { setSession({ ...session, scenario: { ...active, simulated: plan.resultingState, recoveryAccepted: true } }); notify(`${plan.steps.filter((step) => step.feasible).length} recovery step(s) applied to scenario state only.`); }}><Check /> Accept feasible recovery steps (scenario only)</button>
                </div>
              )}
              {active.recoveryAccepted && <p className="success-note" data-testid="recovery-accepted"><Check /> Recovery plan accepted inside the isolated scenario. Canonical demo is unchanged.</p>}
              {active.impactedWorkOrderIds.length > 0 && <div className="impacted-list"><strong>Impacted identifiers</strong><p>{active.impactedWorkOrderIds.slice(0, 12).join(" · ")}{active.impactedWorkOrderIds.length > 12 ? ` · +${active.impactedWorkOrderIds.length - 12} more` : ""}</p></div>}
            </>
          ) : <EmptyState title="Select a disruption" body="Each scenario starts from current canonical state, computes before-and-after metrics, and can be fully reversed." />}
        </section>
      </div>
    </>
  );
}

function AnalyticsView({ state }: { state: OperationalState }) {
  const metrics = calculateMetrics(state);
  return (
    <>
      <div className="page-title-row"><div><h1>Operational analytics</h1><p>Documented calculations tied to shared work-order, workforce, inventory, and financial records.</p></div><span className="definition-chip">As of Mon, Oct 26 · 9:00 AM ET</span></div>
      <div className="analytics-grid">
        <section className="panel analytics-hero"><small>Recognized service revenue</small><strong>{formatCurrency(metrics.recognizedRevenueCents)}</strong><p>Separate from invoicing and cash collection. Taxes are not modeled.</p><div><span>Gross margin <b>{metrics.grossMarginRate.toFixed(1)}%</b></span><span>Scheduled utilization <b>{metrics.scheduledUtilization.toFixed(1)}%</b></span><span>MTTR <b>{Math.round(metrics.meanTimeToRepairMinutes / 60)} hrs</b></span></div></section>
        <section className="panel formula-panel"><h2>Calculation registry</h2><dl><dt>First-time fix rate</dt><dd>{metricDefinitions.firstTimeFixRate}</dd><dt>Technician utilization</dt><dd>{metricDefinitions.scheduledUtilization}</dd><dt>Mean time to repair</dt><dd>{metricDefinitions.meanTimeToRepair}</dd><dt>SLA risk</dt><dd>{metricDefinitions.slaRisk}</dd><dt>Gross margin</dt><dd>{metricDefinitions.grossMargin}</dd></dl></section>
      </div>
      <DispatchTimeline state={state}/>
    </>
  );
}

function PortfolioView({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="portfolio-view">
      <section className="portfolio-copy"><span className="portfolio-mark"><Command/> ServiceOPS</span><h1>Field service intelligence, dispatch, and operational control.</h1><p>A browser-based operations command platform demonstrating validated work-order lifecycles, explainable scheduling, parts integrity, service economics, deterministic automation, and reversible disruption modeling.</p><div className="portfolio-actions"><button className="primary-button" onClick={onLaunch}>Open live demo <ArrowRight/></button><a className="secondary-button" href="https://github.com/Cabberefwenf/ServiceOPS" target="_blank" rel="noreferrer">Private repository</a></div><small>All displayed companies, people, sites, assets, work orders, and financials are synthetic.</small></section>
      <section className="portfolio-proof"><div><small>Architecture</small><strong>Local-first, versioned state</strong><p>No account, database, provider, or paid API is required.</p></div><div><small>Operational integrity</small><strong>Atomic domain commands</strong><p>Transitions, schedules, reservations, costs, and audit events move together.</p></div><div><small>Human authority</small><strong>Preview before execution</strong><p>Recommendations explain constraints and require explicit approval.</p></div><div><small>Technology</small><strong>Next.js · React · TypeScript</strong><p>Zod boundaries, Vitest domain checks, and Playwright browser verification.</p></div></section>{/* Plain <img>: static PNGs, avoids paid image-optimization usage. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <section className="portfolio-shots" aria-label="Screenshots of the running demo">{[["overview","Operations overview with KPIs, attention queue, and dispatch timeline"],["work-order","Work-order detail with explainable assignment recommendation"],["scheduling","Scheduling run compared to a first-available baseline"],["scenario","Scenario Lab technician-callout recovery plan"]].map(([file, alt]) => <figure key={file}><img src={`/portfolio/${file}.png`} alt={alt} loading="lazy" width={1440} height={900}/><figcaption>{alt}</figcaption></figure>)}</section>
    </div>
  );
}

const tourSteps: Array<{ view: View; title: string; body: string }> = [
  { view: "Overview", title: "Operations overview", body: "KPIs are computed from the current demo state. Click a KPI to drill into matching work orders, or filter by region." },
  { view: "Work Orders", title: "Work-order lifecycle", body: "WO-10483 is a critical chiller failure. Preview the recommended technician, approve, reserve the part, and complete it with a validated record." },
  { view: "Scheduling", title: "Batch scheduling", body: "Run the greedy heuristic over the ready queue and compare it to a naive first-available baseline before accepting anything." },
  { view: "Scenario Lab", title: "Disruption modeling", body: "Apply a technician callout or parts shortage to an isolated copy of state, review the recovery plan, and reset without touching canonical data." },
  { view: "Financials", title: "Invoices and cash", body: "Closed jobs become invoiceable. Invoiced revenue and cash received are tracked separately in integer cents." },
  { view: "Automation", title: "Human-approved automation", body: "Threshold rules propose actions with an exact preview. Nothing executes without approval, and every decision leaves a receipt." },
  { view: "Activity", title: "Audit trail", body: "Every state-changing command appends an audit event. Filter by type or search by entity." },
];

function GuidedTour({ step, onStep, onClose }: { step: number; onStep: (index: number) => void; onClose: () => void }) {
  const current = tourSteps[step];
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  if (!current) return null;
  return (
    <div className="tour-card" role="dialog" aria-modal="false" aria-labelledby="tour-title" data-testid="tour">
      <small>Guided tour · step {step + 1} of {tourSteps.length}</small>
      <h2 id="tour-title">{current.title}</h2>
      <p>{current.body}</p>
      <div className="tour-actions">
        <button className="text-button" onClick={onClose}>End tour</button>
        <button className="secondary-button" disabled={step === 0} onClick={() => onStep(step - 1)}>Back</button>
        {step < tourSteps.length - 1 ? <button className="primary-button" data-testid="tour-next" autoFocus onClick={() => onStep(step + 1)}>Next <ArrowRight /></button> : <button className="primary-button" data-testid="tour-finish" onClick={onClose}><Check /> Finish</button>}
      </div>
    </div>
  );
}

export function ServiceOpsApp() {
  const [session, setSession] = useState<DemoSession>(() => createSeedSession());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("Overview");
  const [selectedId, setSelectedId] = useState("WO-10483");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [drill, setDrill] = useState<OrderFilter>("ALL");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const state = session.scenario?.simulated ?? session.canonical;
  const metrics = useMemo(() => calculateMetrics(state), [state]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const { session: loaded, outcome } = loadSessionWithOutcome();
      setSession(loaded);
      setHydrated(true);
      if (outcome.kind === "rejected") setToast({ message: `Saved demo state was rejected (${outcome.reason}); the verified baseline was loaded instead.`, tone: "error" });
      else if (outcome.kind === "restored" && outcome.migratedFrom) setToast({ message: `Saved demo state migrated from schema v${outcome.migratedFrom} to v2.`, tone: "success" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (hydrated) saveSession(session);
  }, [hydrated, session]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function notify(message: string, tone: "success" | "error" = "success") {
    setToast({ message, tone });
  }
  function updateState(next: OperationalState) {
    if (session.scenario) setSession({ ...session, scenario: { ...session.scenario, simulated: next } });
    else setSession({ ...session, canonical: next });
  }
  function commit(result: OperationResult) {
    if (result.ok) { updateState(result.state); notify(result.message); }
    else notify(result.error, "error");
  }
  const screen = { state, commit, onOpenOrder: openOrder };
  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
  }
  function openOrder(id: string) {
    setSelectedId(id);
    navigate("Work Orders");
  }
  function resetDemo() {
    setSession(createSeedSession());
    setSelectedId("WO-10483");
    setView("Overview");
    notify("Canonical synthetic demo restored to its verified baseline.");
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="topbar">
        <button className="mobile-menu-button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu/></button>
        <button className="brand" onClick={() => navigate("Overview")}><span>Service</span><b>OPS</b></button>
        <span className="synthetic-label"><FlaskConical/> Synthetic demo</span>
        <form className="global-search" role="search" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("q"); setGlobalQuery(String(value ?? "")); setDrill("ALL"); navigate("Work Orders"); }}><Search aria-hidden="true"/><label htmlFor="global-search-input" className="sr-only">Search work orders</label><input id="global-search-input" name="q" data-testid="global-search" placeholder="Search work orders by ID, description, or customer…" /></form>
        <span className="header-filter" title="Synthetic demo clock"><CalendarDays aria-hidden="true"/> Mon, Oct 26 · 9:00 AM ET</span>
        <span className="header-health"><span/> {metrics.slaRisk} SLA risks</span>
        <button className="reset-button" data-testid="start-tour" onClick={() => { setTourStep(0); navigate("Overview"); }}><Sparkles/> Tour</button>
        <button className="reset-button" data-testid="reset-demo" onClick={resetDemo}><RefreshCw/> Reset demo</button>
        <span className="user-avatar">JD</span>
      </header>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="mobile-sidebar-head"><span>Navigation</span><button aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X/></button></div>
        <nav aria-label="Primary navigation">
          {navItems.map(({ label: item, icon: Icon }) => <button key={item} data-testid={`nav-${item.toLowerCase().replaceAll(" ", "-")}`} className={view === item ? "nav-active" : ""} onClick={() => navigate(item)}><Icon/><span>{item}</span></button>)}
        </nav>
        <div className="sidebar-footer"><strong>Northstar</strong><span>Industrial Service Group</span><p>Field service for a more reliable tomorrow.</p><small>Synthetic records only.<br/>No real customers or people.</small></div>
      </aside>
      {mobileOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main id="main-content" className={`main-content view-${view.toLowerCase().replaceAll(" ", "-")}`}>
        {session.scenario && view !== "Scenario Lab" && <div className="scenario-banner"><FlaskConical/><span>Viewing isolated scenario: <strong>{session.scenario.title}</strong></span><button onClick={() => navigate("Scenario Lab")}>Inspect comparison</button></div>}
        {view === "Overview" && <OverviewView state={state} onOpenOrder={openOrder} onDrill={(filter) => { setGlobalQuery(""); setDrill(filter); navigate("Work Orders"); }}/>} 
        {view === "Work Orders" && <WorkOrdersView key={`${globalQuery}|${drill}`} initialQuery={globalQuery} initialFilter={drill} state={state} selectedId={selectedId} setSelectedId={setSelectedId} updateState={updateState} notify={notify}/>} 
        {view === "Dispatch" && <DispatchView state={state} onOpenOrder={openOrder}/>} 
        {view === "Scheduling" && <SchedulingView {...screen}/>} 
        {view === "Technicians" && <TechniciansView {...screen}/>} 
        {view === "Customers" && <CustomersView {...screen}/>} 
        {view === "Assets" && <AssetsView {...screen}/>} 
        {view === "Agreements" && <AgreementsView {...screen}/>} 
        {view === "Inventory" && <InventoryView {...screen}/>} 
        {view === "Financials" && <FinancialsView {...screen}/>} 
        {view === "Automation" && <AutomationView {...screen}/>} 
        {view === "Scenario Lab" && <ScenarioLabView session={session} setSession={setSession} notify={notify}/>} 
        {view === "Analytics" && <AnalyticsView state={state}/>} 
        {view === "Activity" && <ActivityView {...screen}/>} 
        {tourStep !== null && <GuidedTour step={tourStep} onClose={() => setTourStep(null)} onStep={(index) => { setTourStep(index); const target = tourSteps[index]; if (target) { if (target.view === "Work Orders") setSelectedId("WO-10483"); navigate(target.view); } }} />}
        {view === "Portfolio" && <PortfolioView onLaunch={() => navigate("Overview")}/>} 
      </main>
      {toast && <div className={`toast toast-${toast.tone}`} role="status"><span>{toast.tone === "success" ? <Check/> : <AlertTriangle/>}</span>{toast.message}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><X/></button></div>}
    </div>
  );
}
