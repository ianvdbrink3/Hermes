import { parseLiteSnapshot, type LiteSnapshot } from "./g11-lite";
export type ShadowSnapshot = {
  schema_version: 1; generated_at: string; read_only: true; live_orders_enabled: false;
  latest: Record<string, unknown>; history: Record<string, unknown>[];
  metrics: Record<string, unknown>; pnl: string | null;
  health: Record<string, unknown>; research_health: Record<string, unknown>; daemon: Record<string, unknown>;
  research: { role: string; generated_at: string; score: string; confidence: string; thesis: string; stale: boolean }[];
  research_fixture: boolean | null;
  safety: { kill_switch: boolean; pending_recovery: boolean; journal_verified: boolean; incomplete_decisions: boolean; reconciled: boolean };
  risk_counts: { blocks: number; resizes: number };
};

export function parseShadowSnapshot(value: unknown): ShadowSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid shadow snapshot");
  const v = value as ShadowSnapshot;
  if (v.schema_version !== 1 || v.read_only !== true || v.live_orders_enabled !== false ||
      !Number.isFinite(Date.parse(v.generated_at)) || !v.safety || !v.metrics ||
      !v.latest || !Array.isArray(v.history) || !Array.isArray(v.research) ||
      !v.health || !v.research_health || !v.daemon || !v.risk_counts ||
      ["kill_switch", "pending_recovery", "journal_verified", "incomplete_decisions", "reconciled"].some(k => typeof (v.safety as unknown as Record<string, unknown>)[k] !== "boolean") ||
      typeof v.risk_counts.blocks !== "number" || typeof v.risk_counts.resizes !== "number" ||
      (Object.keys(v.latest).length > 0 && (v.latest.fixture !== false || v.latest.live_execution_allowed !== false)) ||
      v.research.some(r => !r || typeof r.role !== "string" || typeof r.thesis !== "string" || typeof r.stale !== "boolean") ||
      v.history.some(row => row.fixture !== false || row.live_execution_allowed !== false)) {
    throw new Error("Invalid shadow snapshot");
  }
  return v;
}

export function parseG11Snapshot(value: unknown): ShadowSnapshot | LiteSnapshot {
  if (value && typeof value === "object" && (value as {schema_version?:number}).schema_version === 2) {
    const lite = parseLiteSnapshot(value);
    if (lite.pilot) parseShadowSnapshot(lite.pilot);
    return lite;
  }
  return parseShadowSnapshot(value);
}

export async function fetchShadowSnapshot(): Promise<ShadowSnapshot | LiteSnapshot> {
  const base = (process.env.HERMES_BASE_URL || "").replace(/\/$/, "");
  const state = (process.env.HERMES_AUTONOMY_STATE_URL || (base ? base + "/autonomy-state/snapshot" : "")).replace(/\/$/, "");
  const key = process.env.HERMES_AUTONOMY_STATE_API_KEY || process.env.HERMES_RESEARCH_API_KEY || "";
  if (!state || !key) throw new Error("Shadow feed unavailable");
  const url = new URL(state);
  if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Insecure shadow feed");
  url.pathname = url.pathname.replace(/\/snapshot$/, "/g11-shadow");
  if (!url.pathname.endsWith("/g11-shadow")) throw new Error("Invalid state feed path");
  url.search = ""; url.hash = "";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Shadow feed unavailable");
  return parseG11Snapshot(await response.json());
}
