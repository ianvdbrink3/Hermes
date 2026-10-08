import { describe, expect, it } from "vitest";
import { shadowCycleHealthy } from "./g11-shadow-status";
import type { ShadowSnapshot } from "./g11-shadow";
const at = "2026-10-08T14:06:42.778420+00:00";
function snapshot(status: string, overrides: Record<string, unknown> = {}): ShadowSnapshot {
  return { schema_version: 1, generated_at: at, read_only: true, live_orders_enabled: false,
    health: { status, last_observation: at, ...overrides }, latest: { at },
    history: [], metrics: {}, pnl: null, research_health: {}, daemon: {}, research: [], research_fixture: null,
    risk_counts: { blocks: 0, resizes: 0 },
    safety: { reconciled: true, journal_verified: true, kill_switch: false, pending_recovery: false, incomplete_decisions: false } };
}
describe("cycle health", () => {
  it("accepts completed daily observation without demanding a second cycle", () => {
    expect(shadowCycleHealthy(snapshot("DAILY_COMPLETE"))).toBe(true);
    expect(shadowCycleHealthy(snapshot("PASS"))).toBe(true);
  });
  it("rejects an unmatched completion checkpoint", () => {
    expect(shadowCycleHealthy(snapshot("DAILY_COMPLETE", { last_observation: "2026-10-07T14:00:00Z" }))).toBe(false);
    expect(shadowCycleHealthy(snapshot("DAILY_COMPLETE", { last_observation: undefined }))).toBe(false);
  });
  it("keeps failed and unverified states unhealthy", () => {
    expect(shadowCycleHealthy(snapshot("FAILED"))).toBe(false);
    expect(shadowCycleHealthy(null)).toBe(false);
    const data = snapshot("DAILY_COMPLETE"); data.safety.reconciled = false;
    expect(shadowCycleHealthy(data)).toBe(false);
  });
});


import { shadowOverviewStatus } from "./g11-shadow-status";

it("overview marks halted and stale feeds before reporting active observation", () => {
  const now = Date.parse("2026-10-08T17:00:00Z");
  const data = { generated_at: "2026-10-08T17:00:00Z", latest: { at: "2026-10-08T14:00:00Z" }, health: { status: "DAILY_COMPLETE", last_observation: "2026-10-08T14:00:00Z" }, daemon: { scheduler: "RUNNING", checked_at: "2026-10-08T17:00:00Z" }, safety: { reconciled: true, journal_verified: true, kill_switch: false, pending_recovery: false, incomplete_decisions: false } } as ShadowSnapshot;
  expect(shadowOverviewStatus(data, now)).toBe("Observatie actief");
  expect(shadowOverviewStatus({ ...data, safety: { ...data.safety, kill_switch: true } }, now)).toBe("Observatie geblokkeerd");
  expect(shadowOverviewStatus(data, now + 180_000)).toBe("Actuele status niet bevestigd");
  expect(shadowOverviewStatus({ ...data, safety: { ...data.safety, journal_verified: false } }, now)).toBe("Controles vragen aandacht");
});
