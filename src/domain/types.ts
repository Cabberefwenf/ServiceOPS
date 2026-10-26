export const WORK_ORDER_STATUSES = [
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
  "CLOSED",
  "CANCELLED",
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Region = "East" | "Central" | "West";

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  email: string;
  billingTerms: "NET_30" | "NET_45" | "PREPAID";
}

export interface ServiceLocation {
  id: string;
  customerId: string;
  name: string;
  address: string;
  region: Region;
}

export interface Asset {
  id: string;
  customerId: string;
  locationId: string;
  category: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  installDate: string;
  maintenanceIntervalDays: number;
  lastServiceDate: string;
}

export interface Assignment {
  workOrderId: string;
  start: string;
  end: string;
  locked?: boolean;
}

export interface Technician {
  id: string;
  name: string;
  region: Region;
  skills: string[];
  certifications: string[];
  shiftStart: string;
  shiftEnd: string;
  status: "AVAILABLE" | "ON_JOB" | "UNAVAILABLE" | "LEAVE";
  assignments: Assignment[];
  laborCostRateCents: number;
  completedJobs: number;
  firstTimeFixJobs: number;
}

export interface RequiredPart {
  sku: string;
  quantity: number;
}

export interface ConsumedPart extends RequiredPart {
  unitCostCents: number;
  unitPriceCents: number;
}

export interface WorkOrderFinancials {
  estimatedLaborMinutes: number;
  laborCostCents: number;
  billableLaborCents: number;
  partsCostCents: number;
  partsChargeCents: number;
  travelChargeCents: number;
  discountCents: number;
  recognizedRevenueCents: number;
  invoiceStatus: "NOT_ELIGIBLE" | "ELIGIBLE" | "GENERATED";
}

export interface WorkOrder {
  id: string;
  customerId: string;
  locationId: string;
  assetId: string;
  category: string;
  description: string;
  problemCode: string;
  priority: Priority;
  status: WorkOrderStatus;
  requiredSkills: string[];
  requiredCertifications: string[];
  requiredParts: RequiredPart[];
  consumedParts: ConsumedPart[];
  assignedTechnicianId?: string;
  scheduledStart?: string;
  estimatedDurationMinutes: number;
  actualLaborMinutes?: number;
  appointmentStart: string;
  appointmentEnd: string;
  createdAt: string;
  firstRespondedAt?: string;
  completedAt?: string;
  closedAt?: string;
  slaResponseDue: string;
  slaResolutionDue: string;
  visits: number;
  reopened: boolean;
  resolutionCode?: string;
  completionNotes?: string;
  financials: WorkOrderFinancials;
}

export interface InventoryItem {
  sku: string;
  description: string;
  category: string;
  warehouse: string;
  onHand: number;
  reorderPoint: number;
  unitCostCents: number;
  unitPriceCents: number;
  reservedBy: Record<string, number>;
  compatibleAssetTypes: string[];
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  type: string;
  entityId: string;
  detail: string;
}

export interface OperationalState {
  schemaVersion: 1;
  organizationName: string;
  now: string;
  customers: Customer[];
  locations: ServiceLocation[];
  assets: Asset[];
  technicians: Technician[];
  workOrders: WorkOrder[];
  inventory: InventoryItem[];
  audit: AuditEvent[];
}

export interface ScenarioState {
  id:
    | "emergency-breakdown"
    | "technician-callout"
    | "critical-parts-shortage"
    | "regional-demand-spike"
    | "preventive-maintenance-campaign"
    | "fleet-efficiency";
  title: string;
  assumption: string;
  affectedTechnicianId?: string;
  impactedWorkOrderIds: string[];
  baseline: OperationalState;
  simulated: OperationalState;
}

export interface DemoSession {
  schemaVersion: 1;
  canonical: OperationalState;
  scenario: ScenarioState | null;
}

export interface OperationSuccess {
  ok: true;
  state: OperationalState;
  message: string;
}

export interface OperationFailure {
  ok: false;
  error: string;
}

export type OperationResult = OperationSuccess | OperationFailure;
