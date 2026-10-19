import { describe, expect, it, vi, afterEach } from "vitest";
import { parseObservation, numeric, monitoringLabel, monitoringCheck, readObservation } from "./observation";
const now = Date.parse("2026-10-19T12:00:00Z");
const base = { schema_version: 1, generated_at: "2026-10-19T12:00:00Z", fixture: false, live_orders_enabled: false };
const monitoring = { ...base, read_only: true, status: "HEALTHY", incidents: [] };
const evaluation = { ...base, edge_proven: false, gate: { status: "INCONCLUSIVE", required_paper_days: 20, required_calendar_span_days: 28, observed_days: 3, calendar_span_days: 7, recent_reconciled: true, live_promotion: false } };
describe("operational observation boundary", () => {
  it("keeps missing and unavailable evidence unknown instead of zero", () => {
    expect(parseObservation({}, now).evaluation).toBeNull();
    expect(parseObservation({ evaluation: { status: "UNAVAILABLE" } }, now).evaluation).toBeNull();
  });
  it("accepts actual zero without confusing unknown costs with zero", () => {
    expect(numeric("0")).toBe(0); expect(numeric(null)).toBeNull();
    expect(numeric("0.12")).toBe(.12); expect(numeric("NaN")).toBeNull();
    expect(numeric("")).toBeNull(); expect(numeric(1)).toBeNull();
  });
  it("rejects fixture, live promotion, altered gate and future evidence", () => {
    expect(parseObservation({ monitoring: { ...monitoring, fixture: true } }, now).monitor).toBeNull();
    expect(parseObservation({ evaluation: { ...evaluation, gate: { ...evaluation.gate, live_promotion: true } } }, now).evaluation).toBeNull();
    expect(parseObservation({ evaluation: { ...evaluation, gate: { ...evaluation.gate, required_paper_days: 1 } } }, now).evaluation).toBeNull();
    expect(parseObservation({ monitoring: { ...monitoring, generated_at: "2026-10-20T12:00:00Z" } }, now).monitor).toBeNull();
  });
  it("flags an old successful report as stale", () => {
    expect(parseObservation({ monitoring, evaluation }, now + 11 * 60_000).stale).toBe(true);
    expect(parseObservation({ monitoring, evaluation }, now).stale).toBe(false);
  });
  it("does not reject healthy monitoring when evaluation is unavailable", () => {
    const result = parseObservation({ monitoring, evaluation: null }, now);
    expect(result.monitor?.status).toBe("HEALTHY"); expect(result.evaluation).toBeNull();
  });
  it("preserves unavailable reasons without inventing numbers", () => {
    const result = parseObservation({ monitoring, evaluation: { ...base, status: "UNAVAILABLE", summary_nl: "Veiligheidscontrole vereist." } }, now);
    expect(result.unavailableReason).toBe("Veiligheidscontrole vereist."); expect(result.evaluation).toBeNull();
  });
  it("rejects review readiness without both observation requirements", () => {
    expect(parseObservation({ evaluation: { ...evaluation, gate: { ...evaluation.gate, status: "READY_FOR_REVIEW" } } }, now).evaluation).toBeNull();
  });
  it("distinguishes Friday completion from a Monday paper slot still pending", () => {
    expect(monitoringCheck({ state: "COMPLETE", date_utc: "2026-10-16", today_pending: true })).toEqual({ label: "Vandaag later gepland", context: "Laatste verschuldigde controle (2026-10-16): Afgerond" });
  });
  it("never labels unknown check state as completed", () => {
    expect(monitoringLabel("NEW_STATE")).toBe("Onbekend");
    expect(monitoringLabel("PENDING")).toBe("Later gepland");
  });
});

describe("bounded observation requests", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  function hangingFetch() {
    let aborted = false;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("Aborted")); }, { once: true });
    })));
    return () => aborted;
  }
  it("releases a hung request at 45 seconds so the next poll can proceed", async () => {
    vi.useFakeTimers();
    const aborted = hangingFetch();
    const result = readObservation(new AbortController().signal);
    const rejected = expect(result).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    expect(aborted()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts the active request on unmount and removes its timeout", async () => {
    vi.useFakeTimers();
    const aborted = hangingFetch(), lifecycle = new AbortController();
    const result = readObservation(lifecycle.signal);
    const rejected = expect(result).rejects.toThrow("Aborted");
    lifecycle.abort();
    await rejected;
    expect(aborted()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
