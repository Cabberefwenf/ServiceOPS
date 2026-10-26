import { z } from "zod";
import { createSeedSession } from "./seed";
import type { DemoSession } from "./types";

export const STORAGE_KEY = "serviceops.demo.v1";
const MAX_SNAPSHOT_BYTES = 5_000_000;

const sessionBoundary = z.object({
  schemaVersion: z.literal(1),
  canonical: z.object({
    schemaVersion: z.literal(1),
    organizationName: z.string(),
    now: z.string(),
    customers: z.array(z.unknown()),
    locations: z.array(z.unknown()),
    assets: z.array(z.unknown()),
    technicians: z.array(z.unknown()),
    workOrders: z.array(z.unknown()),
    inventory: z.array(z.unknown()),
    audit: z.array(z.unknown()),
  }),
  scenario: z.unknown().nullable(),
});

export function loadSession(): DemoSession {
  if (typeof window === "undefined") return createSeedSession();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_SNAPSHOT_BYTES) return createSeedSession();
    const parsed = JSON.parse(raw) as unknown;
    if (!sessionBoundary.safeParse(parsed).success) return createSeedSession();
    return parsed as DemoSession;
  } catch {
    return createSeedSession();
  }
}

export function saveSession(session: DemoSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The demo remains fully usable in memory when storage is disabled or full.
  }
}
