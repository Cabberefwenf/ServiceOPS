import { checkIntegrity } from "./operations";
import { sessionV1Schema, sessionV2Schema, stateV1Schema } from "./schema";
import { createSeedSession } from "./seed";
import { createAgreements, createCalendars, createHistoricalInvoices } from "./seed-commercial";
import type { DemoSession, OperationalState } from "./types";
import type { z } from "zod";

/** Storage key is stable across schema versions; the payload carries its own version. */
export const STORAGE_KEY = "serviceops.demo.v1";
export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_SNAPSHOT_BYTES = 5_000_000;
const BASELINE_REF = "CANONICAL";

/** Serialize with the scenario baseline deduplicated against canonical when identical. */
export function serializeSession(session: DemoSession) {
  if (!session.scenario) return JSON.stringify(session);
  const canonical = JSON.stringify(session.canonical);
  const sameBaseline = JSON.stringify(session.scenario.baseline) === canonical;
  return JSON.stringify({ ...session, scenario: { ...session.scenario, baseline: sameBaseline ? BASELINE_REF : session.scenario.baseline } });
}

export type LoadOutcome =
  | { kind: "seed"; reason: "empty" | "unavailable" }
  | { kind: "restored"; migratedFrom?: number }
  | { kind: "rejected"; reason: string };

type StateV1 = z.infer<typeof stateV1Schema>;

/** v1 → v2: adds business calendars, service agreements, invoices, and automation receipts. */
export function migrateStateV1(state: StateV1): OperationalState {
  const migrated = {
    ...state,
    schemaVersion: 2 as const,
    calendars: createCalendars(),
    agreements: createAgreements(state.customers, state.locations),
    invoices: createHistoricalInvoices(state.workOrders, state.customers, state.now),
    automationReceipts: [],
  };
  return migrated as OperationalState;
}

/** Pure parse + migrate + integrity check. Returns null with a reason when the payload is unusable. */
export function parseSession(raw: string): { session: DemoSession; migratedFrom?: number } | { error: string } {
  if (raw.length > MAX_SNAPSHOT_BYTES) return { error: "snapshot exceeds size limit" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "snapshot is not valid JSON" };
  }
  // Compact form: a scenario baseline identical to canonical is stored as a reference.
  const compact = parsed as { canonical?: unknown; scenario?: { baseline?: unknown } | null } | null;
  if (compact?.scenario && compact.scenario.baseline === BASELINE_REF) compact.scenario.baseline = structuredClone(compact.canonical);
  const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
  let session: DemoSession;
  let migratedFrom: number | undefined;
  if (version === 2) {
    const result = sessionV2Schema.safeParse(parsed);
    if (!result.success) return { error: `schema v2 validation failed: ${result.error.issues[0]?.path.join(".") ?? "unknown"}` };
    session = result.data as DemoSession;
  } else if (version === 1) {
    const result = sessionV1Schema.safeParse(parsed);
    if (!result.success) return { error: `schema v1 validation failed: ${result.error.issues[0]?.path.join(".") ?? "unknown"}` };
    const v1 = result.data;
    session = {
      schemaVersion: 2,
      canonical: migrateStateV1(v1.canonical),
      scenario: v1.scenario
        ? { ...v1.scenario, baseline: migrateStateV1(v1.scenario.baseline), simulated: migrateStateV1(v1.scenario.simulated) }
        : null,
    };
    migratedFrom = 1;
  } else {
    return { error: `unsupported schema version ${String(version)}` };
  }
  const states = [session.canonical, session.scenario?.baseline, session.scenario?.simulated].filter(Boolean) as OperationalState[];
  for (const state of states) {
    const issues = checkIntegrity(state);
    if (issues.length) return { error: `integrity check failed: ${issues[0]?.entity} ${issues[0]?.id} ${issues[0]?.problem}` };
  }
  return { session, migratedFrom };
}

export function loadSessionWithOutcome(): { session: DemoSession; outcome: LoadOutcome } {
  if (typeof window === "undefined") return { session: createSeedSession(), outcome: { kind: "seed", reason: "unavailable" } };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { session: createSeedSession(), outcome: { kind: "seed", reason: "unavailable" } };
  }
  if (!raw) return { session: createSeedSession(), outcome: { kind: "seed", reason: "empty" } };
  const result = parseSession(raw);
  if ("error" in result) return { session: createSeedSession(), outcome: { kind: "rejected", reason: result.error } };
  return { session: result.session, outcome: { kind: "restored", migratedFrom: result.migratedFrom } };
}

export function loadSession(): DemoSession {
  return loadSessionWithOutcome().session;
}

export function saveSession(session: DemoSession) {
  if (typeof window === "undefined") return;
  try {
    const serialized = serializeSession(session);
    if (serialized.length > MAX_SNAPSHOT_BYTES) return;
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // The demo remains fully usable in memory when storage is disabled or full.
  }
}
