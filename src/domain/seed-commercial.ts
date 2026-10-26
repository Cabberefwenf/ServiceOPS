import type {
  BusinessCalendar,
  Customer,
  Invoice,
  ServiceAgreement,
  ServiceLocation,
  WorkOrder,
} from "./types";

/** Synthetic business calendars. Holidays are fictional company closures on US dates. */
export function createCalendars(): BusinessCalendar[] {
  const holidays = ["2026-09-07", "2026-11-26", "2026-11-27", "2026-12-24", "2026-12-25", "2027-01-01"];
  return [
    {
      id: "CAL-247",
      name: "24×7 critical coverage",
      timeZone: "America/New_York",
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      openMinute: 0,
      closeMinute: 1440,
      holidays: [],
    },
    {
      id: "CAL-EXT",
      name: "Extended weekdays 7:00–19:00 ET",
      timeZone: "America/New_York",
      workingDays: [1, 2, 3, 4, 5],
      openMinute: 7 * 60,
      closeMinute: 19 * 60,
      holidays,
    },
    {
      id: "CAL-STD",
      name: "Standard weekdays 8:00–17:00 ET",
      timeZone: "America/New_York",
      workingDays: [1, 2, 3, 4, 5],
      openMinute: 8 * 60,
      closeMinute: 17 * 60,
      holidays,
    },
  ];
}

const tiers = {
  PLATINUM: {
    calendarId: "CAL-247",
    responseMinutes: { CRITICAL: 60, HIGH: 120, MEDIUM: 240, LOW: 480 },
    resolutionMinutes: { CRITICAL: 240, HIGH: 480, MEDIUM: 1440, LOW: 2880 },
  },
  GOLD: {
    calendarId: "CAL-EXT",
    responseMinutes: { CRITICAL: 120, HIGH: 240, MEDIUM: 480, LOW: 720 },
    resolutionMinutes: { CRITICAL: 480, HIGH: 720, MEDIUM: 1440, LOW: 2880 },
  },
  STANDARD: {
    calendarId: "CAL-STD",
    responseMinutes: { CRITICAL: 240, HIGH: 480, MEDIUM: 540, LOW: 1080 },
    resolutionMinutes: { CRITICAL: 540, HIGH: 1080, MEDIUM: 2160, LOW: 4320 },
  },
} as const;

export function createAgreements(customers: Customer[], locations: ServiceLocation[]): ServiceAgreement[] {
  return customers.map((customer, index) => {
    const tier = index % 5 === 0 ? "PLATINUM" : index % 3 === 0 ? "GOLD" : "STANDARD";
    const config = tiers[tier];
    return {
      id: `SA-${String(index + 1).padStart(4, "0")}`,
      customerId: customer.id,
      name: `${customer.name} ${tier === "PLATINUM" ? "Critical Care" : tier === "GOLD" ? "Priority Service" : "Standard Service"}`,
      tier,
      coverageStart: "2026-01-01T05:00:00.000Z",
      coverageEnd: index % 11 === 0 ? "2026-11-30T05:00:00.000Z" : "2027-01-01T05:00:00.000Z",
      calendarId: config.calendarId,
      coveredLocationIds: locations.filter((location) => location.customerId === customer.id).map((location) => location.id),
      contractedServiceTypes: ["Corrective maintenance", "Preventive maintenance"],
      responseMinutes: { ...config.responseMinutes },
      resolutionMinutes: { ...config.resolutionMinutes },
      exclusions: tier === "STANDARD" ? ["After-hours callouts billed separately", "Consumables"] : ["Consumables"],
      escalationContacts: [customer.contactName, "Northstar duty manager"],
    };
  });
}

/** Invoice total for a closed work order, in integer cents. */
export function invoiceTotalCents(order: WorkOrder) {
  const f = order.financials;
  return f.billableLaborCents + f.partsChargeCents + f.travelChargeCents - f.discountCents;
}

export function createHistoricalInvoices(workOrders: WorkOrder[], customers: Customer[], now: string): Invoice[] {
  const terms = new Map(customers.map((customer) => [customer.id, customer.billingTerms]));
  const invoices: Invoice[] = [];
  for (const order of workOrders) {
    if (order.status !== "CLOSED" || order.financials.invoiceStatus !== "GENERATED" || !order.closedAt) continue;
    const issuedMs = Date.parse(order.closedAt);
    const days = terms.get(order.customerId) === "NET_45" ? 45 : terms.get(order.customerId) === "PREPAID" ? 0 : 30;
    const totalCents = invoiceTotalCents(order);
    const ageDays = (Date.parse(now) - issuedMs) / 86_400_000;
    const n = Number(order.id.replace(/\D/g, ""));
    const paidCents = ageDays > 50 || n % 9 === 0 ? totalCents : ageDays > 20 && n % 4 === 0 ? Math.floor(totalCents / 2) : 0;
    invoices.push({
      id: `INV-${order.id.slice(3)}`,
      workOrderId: order.id,
      customerId: order.customerId,
      issuedAt: order.closedAt,
      dueAt: new Date(issuedMs + days * 86_400_000).toISOString(),
      lines: [
        { description: "Billable labor", amountCents: order.financials.billableLaborCents },
        { description: "Parts", amountCents: order.financials.partsChargeCents },
        { description: "Travel", amountCents: order.financials.travelChargeCents },
        ...(order.financials.discountCents ? [{ description: "Discount", amountCents: -order.financials.discountCents }] : []),
      ],
      totalCents,
      paidCents,
      status: paidCents === totalCents ? "PAID" : paidCents > 0 ? "PARTIALLY_PAID" : "ISSUED",
    });
  }
  return invoices;
}
