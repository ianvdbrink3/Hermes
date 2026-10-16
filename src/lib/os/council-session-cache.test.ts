import { describe, expect, it } from "vitest";
import { rememberVerifiedCouncilSnapshot, restoreVerifiedCouncilSnapshot } from "./council-session-cache";
import type { CouncilSnapshot } from "./council";

const NOW = Date.parse("2026-10-16T21:00:00Z");
const snapshot = {
 schema_version: 3, mode: "council", fixture: false,
 live_orders_enabled: false, generated_at: new Date(NOW).toISOString(),
 counts: { registered: 267, scanned: 267, research: 10, paper_days: 3 },
 messages: [], report: null, blockers_nl: [], stocks: [], next_cursor: null,
 research_active: true,
 budget: { total_consumed: 0, limit: 20, chat_consumed: 0, chat_limit: 4 },
} as CouncilSnapshot;

describe("last source-validated Council snapshot", () => {
 it("restores prior real JSON only in fail-closed read-only mode", () => {
  const values = new Map<string, string>();
  const storage = {
   getItem: (k: string) => values.get(k) ?? null,
   setItem: (k: string, v: string) => { values.set(k, v); },
  };
  rememberVerifiedCouncilSnapshot(storage, snapshot, NOW);
  const restored = restoreVerifiedCouncilSnapshot(storage, NOW + 120_000);
  expect(restored?.snapshot.counts.paper_days).toBe(3);
  expect(restored?.snapshot.research_active).toBe(false);
  expect(restored?.snapshot.live_orders_enabled).toBe(false);
  expect(restoreVerifiedCouncilSnapshot(storage, NOW + 25 * 3_600_000)).toBeNull();
 });
 it("rejects forged fixture and invalid stored JSON", () => {
  const values = new Map<string, string>();
  const storage = {
   getItem: (k: string) => values.get(k) ?? null,
   setItem: (k: string, v: string) => { values.set(k, v); },
  };
  rememberVerifiedCouncilSnapshot(storage, {...snapshot,fixture: true} as unknown as CouncilSnapshot, NOW);
  expect(restoreVerifiedCouncilSnapshot(storage, NOW)).toBeNull();
  rememberVerifiedCouncilSnapshot(storage, snapshot, NOW);
  const key = [...values.keys()][0];
  values.set(key, JSON.stringify({ saved_at: new Date(NOW).toISOString(), snapshot: { fixture: true } }));
  expect(restoreVerifiedCouncilSnapshot(storage, NOW)).toBeNull();
 });
});
