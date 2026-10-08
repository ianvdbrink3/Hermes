"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HermesShell } from "./hermes-shell";
import type { ShadowSnapshot } from "@/lib/os/g11-shadow";
import { shadowCycleHealthy } from "@/lib/os/g11-shadow-status";
import styles from "./g11-shadow-dashboard.module.css";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown, fallback = "Niet beschikbaar"): string { return value == null || value === "" ? fallback : typeof value === "object" ? JSON.stringify(value) : String(value); }
function numeric(value: unknown, percent = false) {
  if (value == null || value === "") return "Onvoldoende observaties";
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2, style: percent ? "percent" : "decimal" }).format(n) : "Niet beschikbaar";
}
function at(value: unknown) {
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) : "Niet beschikbaar";
}
function bool(value: unknown) { return value === true ? "Ja" : value === false ? "Nee" : "Onbekend"; }

export function G11ShadowDashboard() {
  const [data, setData] = useState<ShadowSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    setBusy(true);
    try {
      const response = await fetch("/api/os/g11-shadow", { cache: "no-store", signal });
      if (!response.ok) throw new Error("G11 shadowgegevens zijn niet bereikbaar. De actuele veiligheidsstatus is onbekend.");
      const snapshot = await response.json() as ShadowSnapshot;
      if (sequence !== requestSequence.current || signal?.aborted) return;
      setData(snapshot); setError("");
    } catch (e) {
      if (signal?.aborted || sequence !== requestSequence.current) return;
      setError(e instanceof Error ? e.message : "Shadowgegevens niet beschikbaar.");
      setData(null);
    } finally { if (!signal?.aborted && sequence === requestSequence.current) setBusy(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try { await refresh(controller.signal); } finally { running = false; }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  const latest = data?.latest || {};
  const portfolio = record(latest.portfolio);
  const holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings.map(record) : [];
  const thesis = record(latest.thesis);
  const risk = record(latest.risk_telemetry);
  const metrics = data?.metrics || {};
  const calibration = record(metrics.calibration);
  const safety = data?.safety;
  const halted = safety?.kill_switch || safety?.pending_recovery || safety?.incomplete_decisions;
  const daemonAt = Date.parse(text(data?.daemon.checked_at || data?.daemon.at || data?.daemon.updated_at, ""));
  const daemonFresh = Number.isFinite(daemonAt) && Date.now() - daemonAt >= 0 && Date.now() - daemonAt < 5 * 60_000;
  const snapshotFresh = data && Date.now() - Date.parse(data.generated_at) >= 0 && Date.now() - Date.parse(data.generated_at) < 3 * 60_000;
  const cycleHealthy = shadowCycleHealthy(data);
  const schedulerHealthy = data?.daemon.scheduler === "RUNNING";
  const healthy = cycleHealthy && schedulerHealthy && daemonFresh && snapshotFresh;
  const status = error ? "Shadow feed offline" : !data ? "Shadowgegevens laden" : halted ? "Shadow geblokkeerd" : !daemonFresh || !snapshotFresh ? "Shadow status verouderd" : !cycleHealthy || !schedulerHealthy ? "Shadow vereist controle" : "Shadow observatie actief";
  return <HermesShell active="trading" status={status} statusTone={error || halted || data?.health.status === "FAILED" ? "bad" : healthy ? "good" : "warn"}>
    <div className={styles.dashboard}>
      <header className={styles.header}><div><span className={styles.eyebrow}>G11 · Shadow Observatory</span><h1>Paper portfolio en beslissingen</h1><p>Echte research en marktdata. Gesimuleerde transacties in USD; live orders blijven uitgeschakeld.</p></div><button disabled={busy} onClick={() => void refresh()}>{busy ? "Laden…" : "Vernieuwen"}</button></header>
      {error && <div role="alert" className={styles.alert}>{error}</div>}
      {!data && !error && <p role="status">Gevalideerde shadowgegevens laden…</p>}
      {data && <>
        <div className={styles.badges}><span>Live orders: uitgeschakeld</span><span>{latest.fixture === false ? "Echte marktdata" : "Nog geen paper cycle"}</span><span>Laatste cycle: {at(latest.at)}</span><span>Feed: {at(data.generated_at)}</span></div>
        <section className={styles.metrics} aria-label="Portfolio en performance">
          {([["Paper vermogen · USD", portfolio.total_value, false], ["P&L · USD", data.pnl, false], ["Hermes rendement", metrics.portfolio_return, true], ["Benchmark · SPY", metrics.benchmark_return, true], ["Excess rendement", metrics.excess_return, true], ["Sharpe", metrics.sharpe, false], ["Sortino", metrics.sortino, false], ["Max drawdown", metrics.max_drawdown, true]] as const).map(([label, value, percent]) => <article key={label}><span>{label}</span><strong>{numeric(value, percent)}</strong></article>)}
        </section>
        <section className={styles.panel}><h2>Veiligheid en reconciliation</h2><div className={styles.safety}>
          <div><span>Kill switch</span><strong>{safety?.kill_switch ? "ACTIEF" : "Niet actief"}</strong></div>
          <div><span>Pending recovery</span><strong>{bool(safety?.pending_recovery)}</strong></div>
          <div><span>Reconciliation</span><strong>{safety?.reconciled ? "Geverifieerd" : "Niet bevestigd"}</strong></div>
          <div><span>Journal integriteit</span><strong>{bool(safety?.journal_verified)}</strong></div>
          <div><span>Cycle health</span><strong>{text(data.health.status)}</strong><small>{at(data.health.checked_at)}</small></div>
          <div><span>Daemon heartbeat</span><strong>{daemonFresh ? "Actueel" : "Niet actueel / onbekend"}</strong><small>{at(Number.isFinite(daemonAt) ? new Date(daemonAt).toISOString() : null)}</small></div>
        </div></section>
        <section className={styles.panel}><h2>Huidige paper portfolio</h2><p>Cash: {numeric(portfolio.cash)} USD. Waardering per {at(portfolio.as_of)}.</p><div className={styles.scroll}><table><thead><tr>{["Instrument", "Aantal", "Gemiddelde kostprijs", "Marktprijs", "Marktwaarde"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{holdings.length ? holdings.map((h, i) => <tr key={text(h.instrument_id) + i}><td>{text(h.instrument_id)}</td>{["quantity", "average_cost", "market_price", "market_value"].map(k => <td key={k}>{numeric(h[k])}</td>)}</tr>) : <tr><td colSpan={5}>{latest.at ? "Geen open paper posities" : "Nog geen geverifieerde portfolio"}</td></tr>}</tbody></table></div><small>{text(latest.paper_fill_assumptions, "Nog geen fillmodel geregistreerd")}</small></section>
        <section className={styles.panel}><h2>Open theses</h2><p className={styles.eyebrow}>{holdings.length ? "Open positie · monitoring" : "Research thesis · geen open positie"}</p><p>{text(thesis.base_case, "Nog geen gevalideerde thesis")}</p><details><summary>Invalidatievoorwaarden</summary><ul>{Array.isArray(thesis.invalidation_conditions) && thesis.invalidation_conditions.map((v, i) => <li key={i}>{text(v)}</li>)}</ul></details></section>
        <section className={styles.panel}><h2>Laatste CIO decisions en risk</h2><p>Risk blocks: {data.risk_counts.blocks} · resizes: {data.risk_counts.resizes}. Confidence is nog niet gekalibreerd.</p><div className={styles.scroll}><table><thead><tr>{["Cycle", "CIO", "Confidence", "Risk", "Paper trade", "Vermogen · USD"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{data.history.length ? data.history.map((r, i) => <tr key={text(r.decision_id) + i}><td>{at(r.at)}</td><td>{text(r.decision_action)}</td><td>{numeric(r.decision_confidence, true)}</td><td>{text(r.risk_status)}</td><td>{bool(r.executed)}</td><td>{numeric(r.equity)}</td></tr>) : <tr><td colSpan={6}>Nog geen voltooide paper cycles</td></tr>}</tbody></table></div><p>Laatste risk reasons: {Array.isArray(latest.risk_reasons) && latest.risk_reasons.length ? latest.risk_reasons.map(v => text(v)).join(" · ") : "Geen geregistreerd"}</p><details><summary>Riskmetingen vóór de laatste beslissing</summary><dl className={styles.details}>{[["Drawdown", numeric(risk.drawdown, true)], ["Portfolio volatiliteit · annualized", numeric(risk.annualized_volatility, true)], ["Quote timestamp", at(risk.data_timestamp)], ["Event risk", bool(latest.event_risk)], ["Exposure compleet", bool(latest.exposure_complete)], ["Risk service beschikbaar", bool(risk.risk_service_available)], ["Broker mismatch", bool(risk.broker_mismatch)]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><small>Vastgelegde inputs van de laatste cycle; huidige marktrisico's kunnen afwijken.</small></details></section>
        <section className={styles.panel}><h2>Live research assessments</h2><p>{data.research_fixture === false ? "Echte bronnen" : data.research_fixture === true ? "Fixture research" : "Nog geen gevalideerd research"} · {text(data.research_health.status)}. Voorlopige assessments zijn geen uitgevoerde CIO-besluiten.</p><div className={styles.research}>{data.research.map(r => <article key={r.role}><header><strong>{r.role}</strong><span className={r.stale ? styles.stale : ""}>{r.stale ? "Verouderd" : "Binnen 6 uur"}</span></header><p>Score {numeric(r.score)} · confidence {numeric(r.confidence, true)}</p><small>{at(r.generated_at)} · oorspronkelijke assessmenttijd</small><p>{r.thesis}</p></article>)}</div><small>Bronnen, actuele prijs en risico worden opnieuw gecontroleerd vóór een paper cycle.</small></section>
        <section className={styles.panel}><h2>Confidence calibration en evaluatie</h2><div className={styles.safety}><div><span>Brier score</span><strong>{numeric(calibration.brier)}</strong></div><div><span>Rijpe confidence outcomes</span><strong>{text(calibration.samples, "0")} / 20</strong></div><div><span>Observaties</span><strong>{text(metrics.observations, "0")} / 20</strong></div><div><span>Geobserveerde periode</span><strong>{text(metrics.elapsed_days, "0")} / 28 dagen</strong></div></div><p>{text(metrics.status)} · {text(calibration.definition)}</p><small>Sharpe/Sortino vereisen voldoende dagelijkse returns. Geen downside maakt Sortino onbeschikbaar. Benchmark gebruikt dezelfde observatiemomenten en USD. Deze pilot valideert geen beleggingsperformance en geeft geen toestemming voor live trading.</small></section>
      </>}
    </div>
  </HermesShell>;
}
