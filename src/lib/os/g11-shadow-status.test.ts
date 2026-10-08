import { describe, expect, it } from "vitest";
import { shadowCycleHealthy } from "./g11-shadow-status";
import type { ShadowSnapshot } from "./g11-shadow";
const at = "2026-10-08T14:06:42.778420+00:00";
function snapshot(status: string, overrides: Record<string, unknown> = {}) {
  return { health: { status, last_observation: at, ...overrides }, latest: { at },
    safety: { reconciled: true, journal_verified: true } } as ShadowSnapshot;
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
