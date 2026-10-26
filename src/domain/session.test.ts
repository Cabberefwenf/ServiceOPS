import { describe, expect, it } from "vitest";
import { createScenario } from "./operations";
import { createSeedSession, createSeedState, OPEN_ORDER_COUNT } from "./seed";
import { MAX_SNAPSHOT_BYTES, migrateStateV1, parseSession, serializeSession } from "./session";
import { checkIntegrity } from "./operations";

function v1Snapshot() {
  const state = createSeedState();
  const { calendars, agreements, invoices, automationReceipts, ...rest } = state;
  void calendars; void agreements; void invoices; void automationReceipts;
  return { schemaVersion: 1, canonical: { ...rest, schemaVersion: 1 }, scenario: null };
}

describe("session boundary", () => {
  it("round-trips the current schema", () => {
    const session = createSeedSession();
    const result = parseSession(serializeSession(session));
    expect("session" in result && result.session.canonical.workOrders.length).toBe(1000);
  });

  it("round-trips a scenario using the compact baseline reference and stays under the size limit", () => {
    const session = createSeedSession();
    const scenario = createScenario(session.canonical, "technician-callout", { technicianId: "T-104" });
    const withScenario = { ...session, scenario };
    const serialized = serializeSession(withScenario);
    expect(serialized.length).toBeLessThan(MAX_SNAPSHOT_BYTES);
    const result = parseSession(serialized);
    if (!("session" in result)) throw new Error(result.error);
    expect(result.session.scenario?.baseline.workOrders.length).toBe(1000);
    expect(result.session.scenario?.id).toBe("technician-callout");
  });

  it("migrates a v1 snapshot to v2 with agreements, calendars and invoices", () => {
    const result = parseSession(JSON.stringify(v1Snapshot()));
    if (!("session" in result)) throw new Error(result.error);
    expect(result.migratedFrom).toBe(1);
    expect(result.session.schemaVersion).toBe(2);
    expect(result.session.canonical.agreements.length).toBe(120);
    expect(result.session.canonical.calendars.length).toBe(3);
    expect(result.session.canonical.invoices.length).toBeGreaterThan(0);
    expect(checkIntegrity(result.session.canonical)).toEqual([]);
  });

  it("rejects unknown keys, bad versions, wrong types, malformed JSON, and oversized payloads", () => {
    const tampered = JSON.parse(serializeSession(createSeedSession()));
    tampered.canonical.workOrders[0].injected = "<script>";
    expect("error" in parseSession(JSON.stringify(tampered))).toBe(true);

    const badMoney = JSON.parse(serializeSession(createSeedSession()));
    badMoney.canonical.workOrders[0].financials.billableLaborCents = 12.5;
    expect("error" in parseSession(JSON.stringify(badMoney))).toBe(true);

    expect(parseSession(JSON.stringify({ schemaVersion: 99 }))).toEqual({ error: "unsupported schema version 99" });
    expect("error" in parseSession("{not json")).toBe(true);
    expect(parseSession("x".repeat(MAX_SNAPSHOT_BYTES + 1))).toEqual({ error: "snapshot exceeds size limit" });
  });

  it("rejects schema-valid but referentially broken state", () => {
    const broken = JSON.parse(serializeSession(createSeedSession()));
    broken.canonical.workOrders[0].assetId = "A-MISSING";
    const result = parseSession(JSON.stringify(broken));
    expect("error" in result && result.error).toMatch(/integrity check failed/);
  });

  it("migration is pure and deterministic", () => {
    const snapshot = v1Snapshot();
    expect(migrateStateV1(snapshot.canonical as never)).toEqual(migrateStateV1(snapshot.canonical as never));
  });
});

describe("seed realism", () => {
  const state = createSeedState();
  it("has a meaningful open backlog and unique human names", () => {
    expect(state.workOrders.filter((order) => order.status !== "CLOSED").length).toBe(OPEN_ORDER_COUNT);
    expect(state.technicians.some((tech) => /^Technician \d+/.test(tech.name))).toBe(false);
    expect(new Set(state.technicians.map((tech) => tech.name)).size).toBe(state.technicians.length);
    expect(new Set(state.customers.map((customer) => customer.name)).size).toBe(state.customers.length);
  });
  it("invoices reconcile to recognized revenue and cash never exceeds invoiced", () => {
    for (const invoice of state.invoices) {
      const order = state.workOrders.find((item) => item.id === invoice.workOrderId);
      expect(invoice.totalCents).toBe(order?.financials.recognizedRevenueCents);
      expect(invoice.paidCents).toBeLessThanOrEqual(invoice.totalCents);
    }
    expect(checkIntegrity(state)).toEqual([]);
  });
});
