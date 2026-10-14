import type { ShadowSnapshot } from "./g11-shadow";

export function shadowCycleHealthy(data: ShadowSnapshot | null): boolean {
  if (!data || data.safety.reconciled !== true || data.safety.journal_verified !== true) return false;
  if (data.health.status === "PASS") return true;
  return data.health.status === "DAILY_COMPLETE" &&
    typeof data.latest.at === "string" &&
    data.health.last_observation === data.latest.at;
}

export function shadowOverviewStatus(data: ShadowSnapshot | null, now = Date.now()): string {
  if (!data) return "Status niet beschikbaar";
  if (data.safety.kill_switch || data.safety.pending_recovery || data.safety.incomplete_decisions) return "Observatie geblokkeerd";
  const generated = Date.parse(data.generated_at);
  const heartbeat = Date.parse(String(data.daemon.checked_at || data.daemon.at || data.daemon.updated_at || ""));
  if (!Number.isFinite(generated) || now < generated || now - generated >= 180_000 ||
      !Number.isFinite(heartbeat) || now < heartbeat || now - heartbeat >= 300_000) return "Actuele status niet bevestigd";
  if (!shadowCycleHealthy(data) || data.daemon.scheduler !== "RUNNING") return "Controles vragen aandacht";
  return "Observatie actief";
}
