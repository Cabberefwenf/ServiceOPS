import type { BusinessCalendar, OperationalState, ServiceAgreement, WorkOrder } from "./types";

const MINUTE = 60_000;

function localParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

function isWorkingDay(calendar: BusinessCalendar, date: string, weekday: number) {
  return calendar.workingDays.includes(weekday) && !calendar.holidays.includes(date);
}

/**
 * Adds business minutes using the calendar's working days, hours, and holidays.
 * Walks local-day segments; the result is exact except within the one hour of a DST transition.
 */
export function addBusinessMinutes(startIso: string, minutes: number, calendar: BusinessCalendar): string {
  let cursor = Date.parse(startIso);
  let remaining = Math.max(0, Math.round(minutes));
  for (let guard = 0; guard < 2_000; guard += 1) {
    const { date, weekday, minute } = localParts(cursor, calendar.timeZone);
    if (!isWorkingDay(calendar, date, weekday) || minute >= calendar.closeMinute) {
      cursor += (1440 - minute) * MINUTE; // next local midnight
      continue;
    }
    if (minute < calendar.openMinute) {
      cursor += (calendar.openMinute - minute) * MINUTE;
      continue;
    }
    const available = calendar.closeMinute - minute;
    if (remaining <= available) return new Date(cursor + remaining * MINUTE).toISOString();
    remaining -= available;
    cursor += available * MINUTE;
  }
  throw new Error("Calendar has no working time");
}

/** Business minutes elapsed between two instants under the calendar. */
export function businessMinutesBetween(startIso: string, endIso: string, calendar: BusinessCalendar): number {
  let cursor = Date.parse(startIso);
  const end = Date.parse(endIso);
  let total = 0;
  for (let guard = 0; cursor < end && guard < 5_000; guard += 1) {
    const { date, weekday, minute } = localParts(cursor, calendar.timeZone);
    const toMidnight = (1440 - minute) * MINUTE;
    if (!isWorkingDay(calendar, date, weekday) || minute >= calendar.closeMinute) {
      cursor += toMidnight;
      continue;
    }
    if (minute < calendar.openMinute) {
      cursor += (calendar.openMinute - minute) * MINUTE;
      continue;
    }
    const segmentEnd = Math.min(end, cursor + (calendar.closeMinute - minute) * MINUTE);
    total += (segmentEnd - cursor) / MINUTE;
    cursor = segmentEnd;
  }
  return Math.round(total);
}

export function agreementForOrder(state: OperationalState, order: WorkOrder): ServiceAgreement | undefined {
  const at = Date.parse(order.createdAt);
  return state.agreements.find(
    (agreement) =>
      agreement.customerId === order.customerId &&
      agreement.coveredLocationIds.includes(order.locationId) &&
      Date.parse(agreement.coverageStart) <= at &&
      at < Date.parse(agreement.coverageEnd),
  );
}

export type ContractSlaState = "MET" | "BREACHED" | "AT_RISK" | "ON_TRACK" | "NO_AGREEMENT";

export interface ContractSla {
  agreementId?: string;
  calendarName?: string;
  responseDue?: string;
  resolutionDue?: string;
  response: ContractSlaState;
  resolution: ContractSlaState;
  /** Business minutes left to resolution (negative when breached). */
  resolutionBusinessMinutesLeft?: number;
}

function evaluate(dueIso: string, doneIso: string | undefined, nowIso: string, budget: number, calendar: BusinessCalendar): ContractSlaState {
  if (doneIso) return Date.parse(doneIso) <= Date.parse(dueIso) ? "MET" : "BREACHED";
  if (Date.parse(nowIso) > Date.parse(dueIso)) return "BREACHED";
  const left = businessMinutesBetween(nowIso, dueIso, calendar);
  return left <= budget * 0.25 ? "AT_RISK" : "ON_TRACK";
}

/** Contract SLA computed from the governing agreement's business calendar. */
export function contractSla(state: OperationalState, order: WorkOrder): ContractSla {
  const agreement = agreementForOrder(state, order);
  const calendar = agreement && state.calendars.find((item) => item.id === agreement.calendarId);
  if (!agreement || !calendar) return { response: "NO_AGREEMENT", resolution: "NO_AGREEMENT" };
  const responseBudget = agreement.responseMinutes[order.priority];
  const resolutionBudget = agreement.resolutionMinutes[order.priority];
  const responseDue = addBusinessMinutes(order.createdAt, responseBudget, calendar);
  const resolutionDue = addBusinessMinutes(order.createdAt, resolutionBudget, calendar);
  const done = order.completedAt ?? order.closedAt;
  const left = done ? undefined : Date.parse(state.now) > Date.parse(resolutionDue)
    ? -businessMinutesBetween(resolutionDue, state.now, calendar)
    : businessMinutesBetween(state.now, resolutionDue, calendar);
  return {
    agreementId: agreement.id,
    calendarName: calendar.name,
    responseDue,
    resolutionDue,
    response: evaluate(responseDue, order.firstRespondedAt, state.now, responseBudget, calendar),
    resolution: evaluate(resolutionDue, done, state.now, resolutionBudget, calendar),
    resolutionBusinessMinutesLeft: left,
  };
}
