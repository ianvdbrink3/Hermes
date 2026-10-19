export type Row = Record<string, unknown>;
export const row = (v: unknown): Row => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
export const count = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const numeric = (v: unknown): number | null => typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(v) && Number.isFinite(Number(v)) ? Number(v) : null;
export const text = (v: unknown, fallback = "Onbekend") => typeof v === "string" && v.length <= 12000 ? v : fallback;
export const texts = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === "string") ? v as string[] : [];
export type Observation = { monitor: Row | null; evaluation: Row | null; stale: boolean; generatedAt: string | null; unavailableReason: string | null };
function trusted(v: Row, now: number) {
  const stamp = typeof v.generated_at === "string" ? Date.parse(v.generated_at) : NaN;
  return v.schema_version === 1 && v.fixture === false && v.live_orders_enabled === false && Number.isFinite(stamp) && stamp <= now + 60_000;
}
export function parseObservation(value: unknown, now = Date.now()): Observation {
  const source = row(value), m = row(source.monitoring), e = row(source.evaluation);
  const monitor = trusted(m, now) && m.read_only === true && ["HEALTHY", "ATTENTION", "UNKNOWN"].includes(String(m.status)) && Array.isArray(m.incidents) ? m : null;
  const gate = row(e.gate);
  const evaluation = trusted(e, now) && e.edge_proven === false && gate.live_promotion === false &&
    gate.required_paper_days === 20 && gate.required_calendar_span_days === 28 &&
    ["INCONCLUSIVE", "READY_FOR_REVIEW"].includes(String(gate.status)) &&
    count(gate.observed_days) !== null && count(gate.calendar_span_days) !== null &&
    typeof gate.recent_reconciled === "boolean" &&
    (gate.status !== "READY_FOR_REVIEW" || (Number(gate.observed_days) >= 20 && Number(gate.calendar_span_days) >= 28 && gate.recent_reconciled === true)) ? e : null;
  const stamps = [monitor, evaluation].flatMap(x => x ? [Date.parse(String(x.generated_at))] : []);
  return { monitor, evaluation, stale: stamps.some(x => now - x > 10 * 60_000),
    generatedAt: stamps.length ? new Date(Math.min(...stamps)).toISOString() : null,
    unavailableReason: trusted(e, now) && e.status === "UNAVAILABLE" ? text(e.summary_nl, "De evaluatie is niet beschikbaar.") : null };
}
export function monitoringLabel(value: unknown) {
  return ({ COMPLETE: "Afgerond", PENDING: "Later gepland", DUE: "Controle vereist", UNKNOWN: "Onbekend" } as Record<string, string>)[String(value)] ?? "Onbekend";
}

export function monitoringCheck(value: unknown): { label: string; context: string } {
  const check = row(value), state = monitoringLabel(check.state);
  const day = check.date_utc ?? check.date_amsterdam;
  const date = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  return {
    label: check.today_pending === true ? "Vandaag later gepland" : state,
    context: check.today_pending === true
      ? "Laatste verschuldigde controle" + (date ? " (" + date + ")" : "") + ": " + state
      : date ? "Controledatum: " + date : "",
  };
}

export async function readObservation(signal: AbortSignal): Promise<Observation> {
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) request.abort();
  const timeout = setTimeout(abort, 45_000);
  try {
    const response = await fetch("/api/os/council?cursor=0&q=", {
      cache: "no-store", credentials: "same-origin", redirect: "error", signal: request.signal,
    });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? "Log opnieuw in om de actuele evaluatie te bekijken."
      : "De actuele evaluatie is tijdelijk niet bereikbaar.");
    return parseObservation(await response.json());
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
