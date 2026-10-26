import type {
  Asset,
  AuditEvent,
  Customer,
  DemoSession,
  InventoryItem,
  OperationalState,
  Priority,
  Region,
  ServiceLocation,
  Technician,
  WorkOrder,
  WorkOrderStatus,
} from "./types";
import { createAgreements, createCalendars, createHistoricalInvoices } from "./seed-commercial";

export const DEMO_NOW = "2026-10-26T13:00:00.000Z";

// All names below are fictional and generated for the synthetic demo.
const customerPrefixes = [
  "Riverton", "Oakridge", "Maple", "Pinecrest", "Summit", "Harbor", "Lakeside", "Granite",
  "Cedar Valley", "Ridgeview", "Ironwood", "Bluewater",
];
const customerTypes = [
  "Medical Center", "University", "Foods", "Retail Group", "Data Center", "Cold Storage",
  "Manufacturing", "Utilities", "Logistics", "Hospital",
];
// Unique prefix/type pairing: index i maps to (i % 12, (i % 12 + 3 * floor(i / 12)) % 10).
function customerName(index: number) {
  const prefix = customerPrefixes[index % customerPrefixes.length] ?? "Northstar";
  const type = customerTypes[(index + Math.floor(index / customerPrefixes.length)) % customerTypes.length] ?? "Facility";
  return `${prefix} ${type}`;
}
const firstNames = [
  "Alicia", "Ben", "Carmen", "Darnell", "Elena", "Farid", "Grace", "Hector", "Ingrid", "Jamal",
  "Kenji", "Lena", "Mateo", "Nadia", "Omar", "Paula", "Quinn", "Rosa", "Samir", "Tessa",
  "Umar", "Vera", "Wes", "Ximena", "Yusuf", "Zoe", "Andre", "Bianca", "Colin", "Diana",
  "Emeka", "Fiona", "Gavin", "Hana", "Isaac", "Joy", "Kofi", "Lucia", "Miles", "Noor",
];
const lastNames = [
  "Ramirez", "Okafor", "Lindqvist", "Brennan", "Haddad", "Novak", "Castillo", "Mbeki", "Sorensen",
  "Tanaka", "Delgado", "Whitfield", "Kowalski", "Petrov", "Abara", "Moreau", "Fischer", "Quintero",
  "Ashworth", "Varga", "Nakamura", "Ellison", "Rahman", "Dubois", "Santos", "Holloway", "Iqbal",
];
const openStatusCycle: WorkOrderStatus[] = [
  "REQUESTED",
  "TRIAGED",
  "APPROVED",
  "READY_TO_SCHEDULE",
  "READY_TO_SCHEDULE",
  "WAITING_FOR_CUSTOMER",
  "WAITING_FOR_PARTS",
];
export const OPEN_ORDER_COUNT = 80;
const assetCategories = [
  "HVAC System",
  "Industrial Pump",
  "Conveyor System",
  "Electrical Panel",
  "Warehouse Door",
  "Compressor",
  "Commercial Refrigeration",
];
const skillByCategory: Record<string, string> = {
  "HVAC System": "Commercial HVAC",
  "Industrial Pump": "Rotating Equipment",
  "Conveyor System": "Conveyor Systems",
  "Electrical Panel": "Industrial Electrical",
  "Warehouse Door": "Dock Systems",
  Compressor: "Compressed Air",
  "Commercial Refrigeration": "Commercial HVAC",
};
const activeStatuses: WorkOrderStatus[] = [
  "REQUESTED",
  "TRIAGED",
  "APPROVED",
  "READY_TO_SCHEDULE",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "WAITING_FOR_PARTS",
  "WAITING_FOR_CUSTOMER",
  "WORK_COMPLETED",
  "QUALITY_REVIEW",
];
const priorities: Priority[] = ["LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH", "CRITICAL"];
const regions: Region[] = ["East", "Central", "West"];

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(hoursFromNow: number) {
  return new Date(Date.parse(DEMO_NOW) + hoursFromNow * 3_600_000).toISOString();
}

function financials(minutes: number, rate = 15_000) {
  const billableLaborCents = Math.round((minutes / 60) * rate);
  return {
    estimatedLaborMinutes: minutes,
    laborCostCents: 0,
    billableLaborCents,
    partsCostCents: 0,
    partsChargeCents: 0,
    travelChargeCents: 7_500,
    discountCents: 0,
    recognizedRevenueCents: 0,
    invoiceStatus: "NOT_ELIGIBLE" as const,
  };
}

function explicitTechnicians(): Technician[] {
  return [
    {
      id: "T-104",
      name: "Sarah Chen",
      region: "East",
      skills: ["Commercial HVAC", "Commercial Refrigeration", "Industrial Electrical"],
      certifications: ["EPA 608", "OSHA 30"],
      shiftStart: iso(-1),
      shiftEnd: iso(8),
      status: "AVAILABLE",
      assignments: [
        { workOrderId: "WO-10470", start: iso(3), end: iso(4.5) },
        { workOrderId: "WO-10476", start: iso(6), end: iso(7.5) },
      ],
      laborCostRateCents: 5_800,
      completedJobs: 184,
      firstTimeFixJobs: 169,
    },
    {
      id: "T-102",
      name: "Marcus Bell",
      region: "East",
      skills: ["Commercial HVAC", "Compressed Air"],
      certifications: ["EPA 608"],
      shiftStart: iso(-1),
      shiftEnd: iso(8),
      status: "ON_JOB",
      assignments: [{ workOrderId: "WO-10471", start: iso(-1), end: iso(4) }],
      laborCostRateCents: 5_600,
      completedJobs: 162,
      firstTimeFixJobs: 143,
    },
    {
      id: "T-107",
      name: "Priya Nair",
      region: "East",
      skills: ["Commercial HVAC", "Industrial Electrical"],
      certifications: ["OSHA 30"],
      shiftStart: iso(-1),
      shiftEnd: iso(8),
      status: "AVAILABLE",
      assignments: [],
      laborCostRateCents: 5_500,
      completedJobs: 140,
      firstTimeFixJobs: 121,
    },
    {
      id: "T-109",
      name: "James Wilson",
      region: "West",
      skills: ["Commercial HVAC"],
      certifications: ["EPA 608"],
      shiftStart: iso(1),
      shiftEnd: iso(10),
      status: "AVAILABLE",
      assignments: [],
      laborCostRateCents: 5_300,
      completedJobs: 118,
      firstTimeFixJobs: 99,
    },
  ];
}

function createInventory(): InventoryItem[] {
  const items: InventoryItem[] = [
    {
      sku: "CR-440",
      description: "Compressor relay, 40A",
      category: "Electrical controls",
      warehouse: "East Service Hub",
      onHand: 2,
      reorderPoint: 2,
      unitCostCents: 8_900,
      unitPriceCents: 14_900,
      reservedBy: {},
      compatibleAssetTypes: ["HVAC System", "Commercial Refrigeration"],
    },
    {
      sku: "CB-7821",
      description: "Packaging line control board",
      category: "Controls",
      warehouse: "Central Service Hub",
      onHand: 0,
      reorderPoint: 1,
      unitCostCents: 48_000,
      unitPriceCents: 69_500,
      reservedBy: {},
      compatibleAssetTypes: ["Conveyor System"],
    },
  ];
  for (let i = 3; i <= 320; i += 1) {
    items.push({
      sku: `NS-${String(i).padStart(4, "0")}`,
      description: `Service component ${String(i).padStart(3, "0")}`,
      category: assetCategories[i % assetCategories.length] ?? "General",
      warehouse: `${regions[i % regions.length] ?? "Central"} Service Hub`,
      onHand: 2 + (i % 17),
      reorderPoint: 2 + (i % 4),
      unitCostCents: 1_200 + i * 37,
      unitPriceCents: 2_200 + i * 61,
      reservedBy: {},
      compatibleAssetTypes: [assetCategories[i % assetCategories.length] ?? "HVAC System"],
    });
  }
  return items;
}

export function createSeedState(): OperationalState {
  const random = mulberry32(10_262_026);
  const customers: Customer[] = Array.from({ length: 120 }, (_, index) => ({
    id: `C-${String(index + 1).padStart(4, "0")}`,
    name: customerName(index),
    contactName: `${firstNames[(index * 7) % firstNames.length]} ${lastNames[(index * 5) % lastNames.length]}`,
    email: `ops${index + 1}@example.invalid`,
    billingTerms: (["NET_30", "NET_45", "PREPAID"] as const)[index % 3] ?? "NET_30",
  }));
  const locations: ServiceLocation[] = Array.from({ length: 200 }, (_, index) => {
    const customer = customers[index % customers.length];
    return {
      id: `L-${String(index + 1).padStart(4, "0")}`,
      customerId: customer?.id ?? "C-0001",
      name: index % 3 === 0 ? "Main Campus" : `Facility ${1 + (index % 5)}`,
      address: `${100 + index} Service Way, Northstar, NY ${10001 + (index % 80)}`,
      region: regions[index % regions.length] ?? "Central",
    };
  });
  const assets: Asset[] = Array.from({ length: 480 }, (_, index) => {
    const location = locations[index % locations.length];
    const category = assetCategories[index % assetCategories.length] ?? "HVAC System";
    return {
      id: `A-${String(index + 1).padStart(5, "0")}`,
      customerId: location?.customerId ?? "C-0001",
      locationId: location?.id ?? "L-0001",
      category,
      manufacturer: ["Trane", "Allen-Bradley", "Carrier", "Atlas Copco"][index % 4] ?? "Northstar",
      model: `${category.slice(0, 3).toUpperCase()}-${200 + (index % 70)}`,
      serialNumber: `SYN-${2020 + (index % 6)}-${String(index + 1).padStart(6, "0")}`,
      installDate: new Date(Date.UTC(2017 + (index % 8), index % 12, 1 + (index % 25))).toISOString(),
      maintenanceIntervalDays: [90, 120, 180, 365][index % 4] ?? 180,
      lastServiceDate: iso(-24 * (10 + (index % 190))),
    };
  });
  const technicians = explicitTechnicians();
  for (let index = technicians.length; index < 42; index += 1) {
    const category = assetCategories[index % assetCategories.length] ?? "HVAC System";
    technicians.push({
      id: `T-${String(201 + index)}`,
      name: `${firstNames[index % firstNames.length]} ${lastNames[(index * 3) % lastNames.length]}`,
      region: regions[index % regions.length] ?? "Central",
      skills: [skillByCategory[category] ?? "General Service"],
      certifications: index % 3 === 0 ? ["OSHA 30"] : [],
      shiftStart: iso(-1),
      shiftEnd: iso(8),
      status: index % 7 === 0 ? "LEAVE" : "AVAILABLE",
      assignments: [],
      laborCostRateCents: 4_500 + (index % 8) * 250,
      completedJobs: 40 + index * 5,
      firstTimeFixJobs: 32 + index * 4,
    });
  }

  const workOrders: WorkOrder[] = [];
  const urgentCustomer = customers[0];
  const urgentLocation = locations[0];
  const urgentAsset = assets[0];
  workOrders.push({
    id: "WO-10483",
    customerId: urgentCustomer?.id ?? "C-0001",
    locationId: urgentLocation?.id ?? "L-0001",
    assetId: urgentAsset?.id ?? "A-00001",
    category: "Corrective maintenance",
    description: "Chiller failure — no cooling in building A",
    problemCode: "NO_COOLING",
    priority: "CRITICAL",
    status: "READY_TO_SCHEDULE",
    requiredSkills: ["Commercial HVAC"],
    requiredCertifications: ["EPA 608"],
    requiredParts: [{ sku: "CR-440", quantity: 1 }],
    consumedParts: [],
    estimatedDurationMinutes: 120,
    appointmentStart: iso(0),
    appointmentEnd: iso(3),
    createdAt: iso(-1.75),
    firstRespondedAt: iso(-1.25),
    slaResponseDue: iso(-0.5),
    slaResolutionDue: iso(1),
    visits: 0,
    reopened: false,
    financials: financials(120, 17_500),
  });

  for (let index = 1; index < 1000; index += 1) {
    const asset = assets[index % assets.length];
    const location = locations.find((item) => item.id === asset?.locationId) ?? locations[0];
    const category = asset?.category ?? "HVAC System";
    const status =
      index < 18
        ? activeStatuses[(index - 1) % activeStatuses.length] ?? "REQUESTED"
        : index < OPEN_ORDER_COUNT
          ? openStatusCycle[index % openStatusCycle.length] ?? "REQUESTED"
          : "CLOSED";
    // Preserve the historical random stream: indexes >= 18 always draw a value.
    const historicalHours = index < 18 ? 0 : -Math.floor(random() * 24 * 120);
    const createdHours =
      index < 18
        ? -(1 + (index % 7))
        : index < OPEN_ORDER_COUNT
          ? -(2 + (index % 7) + (index % 5) * 6)
          : historicalHours;
    const duration = 60 + Math.floor(random() * 6) * 30;
    const priority = priorities[Math.floor(random() * priorities.length)] ?? "MEDIUM";
    const isClosed = status === "CLOSED";
    const id = `WO-${10483 - index}`;
    const order: WorkOrder = {
      id,
      customerId: asset?.customerId ?? "C-0001",
      locationId: location?.id ?? "L-0001",
      assetId: asset?.id ?? "A-00001",
      category: index % 4 === 0 ? "Preventive maintenance" : "Corrective maintenance",
      description: `${category} ${index % 4 === 0 ? "planned service" : "reported fault"}`,
      problemCode: index % 4 === 0 ? "PM_DUE" : "EQUIPMENT_FAULT",
      priority,
      status,
      requiredSkills: [skillByCategory[category] ?? "General Service"],
      requiredCertifications: category.includes("HVAC") && index % 3 === 0 ? ["EPA 608"] : [],
      requiredParts: index % 7 === 0 ? [{ sku: `NS-${String(3 + (index % 317)).padStart(4, "0")}`, quantity: 1 }] : [],
      consumedParts: [],
      estimatedDurationMinutes: duration,
      appointmentStart: iso((index % 7) + 1),
      appointmentEnd: iso((index % 7) + 5),
      createdAt: iso(createdHours),
      firstRespondedAt: status === "REQUESTED" ? undefined : iso(createdHours + 2),
      completedAt: isClosed ? iso(createdHours + 8) : undefined,
      closedAt: isClosed ? iso(createdHours + 10) : undefined,
      slaResponseDue: iso(createdHours + (priority === "CRITICAL" ? 1 : 8)),
      slaResolutionDue: iso(createdHours + (priority === "CRITICAL" ? 4 : 36)),
      visits: isClosed ? 1 + (index % 8 === 0 ? 1 : 0) : 0,
      reopened: isClosed && index % 19 === 0,
      financials: financials(duration),
    };
    if (isClosed) {
      order.actualLaborMinutes = Math.round(duration * (0.8 + random() * 0.5));
      order.resolutionCode = "REPAIRED";
      order.completionNotes = "Synthetic service record completed and reviewed.";
      order.financials.recognizedRevenueCents =
        order.financials.billableLaborCents + order.financials.travelChargeCents;
      order.financials.invoiceStatus = "GENERATED";
    }
    workOrders.push(order);
  }

  const byId = new Map(workOrders.map((order) => [order.id, order]));
  for (const tech of technicians.slice(0, 16)) {
    for (const assignment of tech.assignments) {
      const order = byId.get(assignment.workOrderId);
      if (order) {
        order.assignedTechnicianId = tech.id;
        order.scheduledStart = assignment.start;
        order.status = "SCHEDULED";
      }
    }
  }

  const audit: AuditEvent[] = [
    {
      id: "EV-0001",
      timestamp: iso(-0.25),
      actor: "SLA Monitor",
      type: "SLA_RISK",
      entityId: "WO-10483",
      detail: "Resolution commitment enters risk window at 10:00 AM.",
    },
    {
      id: "EV-0002",
      timestamp: iso(-0.6),
      actor: "Inventory",
      type: "PART_RECEIVED",
      entityId: "CR-440",
      detail: "Two compressor relays received at East Service Hub.",
    },
    {
      id: "EV-0003",
      timestamp: iso(-1.1),
      actor: "Dispatch",
      type: "WORK_ORDER_TRIAGED",
      entityId: "WO-10483",
      detail: "Critical no-cooling request approved for scheduling.",
    },
    {
      id: "EV-0004",
      timestamp: iso(-1.5),
      actor: "Sarah Chen",
      type: "TECHNICIAN_DEPARTED",
      entityId: "WO-10470",
      detail: "Departed East Service Hub for Oakridge University.",
    },
    {
      id: "EV-0005",
      timestamp: iso(-2.05),
      actor: "Dispatch",
      type: "ASSIGNMENT_CONFIRMED",
      entityId: "WO-10471",
      detail: "Marcus Bell assignment accepted for Maple Foods.",
    },
    {
      id: "EV-0006",
      timestamp: iso(-2.7),
      actor: "Quality review",
      type: "WORK_ORDER_CLOSED",
      entityId: "WO-10479",
      detail: "Documentation approved; first-time fix recorded.",
    },
    {
      id: "EV-0007",
      timestamp: iso(-3.25),
      actor: "Automation Center",
      type: "REORDER_REVIEW",
      entityId: "CB-7821",
      detail: "Control-board stock reached its reorder threshold.",
    },
  ];

  return {
    schemaVersion: 2,
    organizationName: "Northstar Industrial Service Group",
    now: DEMO_NOW,
    customers,
    locations,
    assets,
    technicians,
    workOrders,
    inventory: createInventory(),
    calendars: createCalendars(),
    agreements: createAgreements(customers, locations),
    invoices: createHistoricalInvoices(workOrders, customers, DEMO_NOW),
    automationReceipts: [],
    audit,
  };
}

export function createSeedSession(): DemoSession {
  return { schemaVersion: 2, canonical: createSeedState(), scenario: null };
}
