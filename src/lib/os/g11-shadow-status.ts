import type { ShadowSnapshot } from "./g11-shadow";

export function shadowCycleHealthy(data: ShadowSnapshot | null): boolean {
  if (!data || data.safety.reconciled !== true || data.safety.journal_verified !== true) return false;
  if (data.health.status === "PASS") return true;
  return data.health.status === "DAILY_COMPLETE" &&
    typeof data.latest.at === "string" &&
    data.health.last_observation === data.latest.at;
}
