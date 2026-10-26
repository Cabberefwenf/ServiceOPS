import { Command, Gauge } from "lucide-react";
import type { Priority } from "@/domain/types";

export function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function time(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function shortDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase()}`}>{label(value)}</span>;
}

export function PriorityTag({ value }: { value: Priority }) {
  return <span className={`priority priority-${value.toLowerCase()}`}>{label(value)}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Command aria-hidden="true" />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function Kpi({ label: title, value, detail, icon: Icon, onClick, testId }: { label: string; value: string; detail: string; icon: typeof Gauge; onClick?: () => void; testId?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`kpi${onClick ? " kpi-drill" : ""}`} onClick={onClick} data-testid={testId} {...(onClick ? { type: "button" as const, "aria-label": `${title}: ${value}. Show matching records` } : {})}>
      <Icon aria-hidden="true" />
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Tag>
  );
}


export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function PageTitle({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return <div className="page-title-row"><div><h1>{title}</h1><p>{body}</p></div>{children}</div>;
}
