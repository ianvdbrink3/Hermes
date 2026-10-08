"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HermesShell } from "./hermes-shell";
import type { ShadowSnapshot } from "@/lib/os/g11-shadow";
import { shadowCycleHealthy } from "@/lib/os/g11-shadow-status";
import { decisionStory, finiteNumber } from "@/lib/os/presentation";
import { ViewTabs } from "./view-tabs";
import styles from "./g11-shadow-dashboard.module.css";

type Row = Record<string, unknown>;
function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown, fallback = "Niet beschikbaar"): string { return value == null || value === "" ? fallback : typeof value === "object" ? JSON.stringify(value) : String(value); }
function numeric(value: unknown, percent = false) {
  if (value == null || value === "") return "Onvoldoende observaties";
  const n = finiteNumber(value);
  return n !== null ? new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2, style: percent ? "percent" : "decimal" }).format(n) : "Niet beschikbaar";
}
function at(value: unknown) {
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) : "Niet beschikbaar";
}
function bool(value: unknown) { return value === true ? "Ja" : value === false ? "Nee" : "Onbekend"; }

export function G11ShadowDashboard() {
  const [tab, setTab] = useState("Samenvatting");
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
  const story = decisionStory(latest.decision_action, latest.executed);
  const riskLabels: Record<string, string> = { APPROVE: "Goedgekeurd", BLOCK: "Geblokkeerd", REJECT: "Afgewezen", RESIZE: "Omvang aangepast" };
  const roleDescriptions: Record<string, [string, string]> = { FUNDAMENTAL: ["Bedrijfsanalyse", "Omzet, winst, waardering en bedrijfsvooruitzichten"], MACRO: ["Macro-economie", "Rente, beleid en de economische omgeving"], QUANT: ["Kwantitatieve analyse", "Prijsbewegingen, momentum en volatiliteit"], SENTIMENT: ["Marktsentiment", "Nieuws, verwachtingen en stemming in de markt"] };
  return <HermesShell active="trading" status={status} statusTone={error || halted || data?.health.status === "FAILED" ? "bad" : healthy ? "good" : "warn"}>
    <div className={styles.dashboard}>
      <header className={styles.header}><div><span className={styles.eyebrow}>Trading · Paper observaties</span><h1>Wat doet Hermes met je paper portfolio?</h1><p>Echte research en marktdata. Gesimuleerde transacties in USD; live orders blijven uitgeschakeld.</p></div><button disabled={busy} onClick={() => void refresh()}>{busy ? "Laden…" : "Vernieuwen"}</button></header>
      {error && <div role="alert" className={styles.alert}>{error}</div>}
      {!data && !error && <p role="status">Gevalideerde shadowgegevens laden…</p>}
      {data && <>
        {!healthy && <div role="alert" className={styles.alert}><strong>{status}</strong><p>De laatste vastgelegde beslissing staat hieronder als historie. De huidige beschikbaarheid en veiligheid zijn niet volledig bevestigd.</p></div>}
        <div className={styles.badges}><span>Live orders: uitgeschakeld</span><span>{latest.fixture === false ? "Echte marktdata" : "Nog geen paper cycle"}</span><span>Laatste cycle: {at(latest.at)}</span><span>Feed: {at(data.generated_at)}</span></div>
        <section className={styles.story} aria-label="Laatste beslissing">
          <div><span className={styles.eyebrow}>{text(thesis.instrument_id, "Instrument onbekend")} · Laatste CIO-besluit · {at(latest.at)}</span><h2>{story.title}</h2><p>{story.explanation}</p></div>
          <div className={styles.decisionFacts}><div><span>Risicocontrole</span><strong>{riskLabels[String(latest.risk_status)] || text(latest.risk_status)}</strong></div><div><span>Uitkomst</span><strong>{story.execution}</strong></div><div><span>Confidence van de CIO</span><strong>{numeric(latest.decision_confidence, true)}</strong><small>Eigen zekerheid van het model; geen gekalibreerde kans op winst.</small></div></div>
          <details><summary>Bekijk de onderbouwing van dit besluit</summary><p>{text(thesis.base_case, "De cyclus heeft nog geen onderbouwing vastgelegd.")}</p><p>Risk redenen: {Array.isArray(latest.risk_reasons) && latest.risk_reasons.length ? latest.risk_reasons.map(v => text(v)).join(" · ") : "Geen redenen geregistreerd."}</p></details>
        </section>
        <section className={styles.metrics} aria-label="Belangrijkste cijfers">
          {([["Paper vermogen · USD", portfolio.total_value, false], ["Winst / verlies · USD", data.pnl, false], ["Observaties", metrics.observations, false]] as const).map(([label, value, percent]) => <article key={label}><span>{label}</span><strong>{numeric(value, percent)}{label === "Observaties" ? " / 20" : ""}</strong><small>{label === "Observaties" ? "Ook minimaal 28 dagen verzamelen" : label.includes("vermogen") ? "Gesimuleerd kapitaal" : "Sinds start van de observatie"}</small></article>)}
        </section>
        <ViewTabs items={["Samenvatting", "Portfolio", "Analyses", "Resultaten"]} active={tab} onChange={setTab}>
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Wat je nu moet weten</h2><p>{healthy ? "De observatie loopt en de laatste veiligheidscontroles zijn bevestigd." : "De actuele observatie of veiligheidsstatus vraagt controle. Bekijk de controles hieronder."}</p><p>Hermes verzamelt dagelijkse beslissingen om later risico, kwaliteit en rendement te beoordelen. Met {text(metrics.observations)} observatie(s) over {text(metrics.elapsed_days)} dag(en) blijft de evaluatiestatus {text(metrics.status)}. De beschikbare prestatiematen staan onder Resultaten.</p><p>Live orders staan uit. Tussen paper cycli kunnen de research-agents hun analyse bijwerken. Een nieuwe analyse is pas een besluit nadat de CIO en risicocontrole een cyclus hebben afgerond.</p></section>}
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Boekhouding en veiligheid</h2><div className={styles.safety}>
          <div><span>Kill switch</span><strong>{safety?.kill_switch === true ? "ACTIEF" : safety?.kill_switch === false ? "Niet actief" : "Onbekend"}</strong></div>
          <div><span>Herstel in afwachting</span><strong>{bool(safety?.pending_recovery)}</strong></div>
          <div><span>Portfolio en journal sluiten aan</span><strong>{safety?.reconciled ? "Geverifieerd" : "Niet bevestigd"}</strong></div>
          <div><span>Journal integriteit</span><strong>{bool(safety?.journal_verified)}</strong></div>
          <div><span>Laatste cycluscontrole</span><strong>{text(data.health.status)}</strong><small>{at(data.health.checked_at)}</small></div>
          <div><span>Automatische runner</span><strong>{daemonFresh ? "Actueel" : "Niet actueel / onbekend"}</strong><small>{at(Number.isFinite(daemonAt) ? new Date(daemonAt).toISOString() : null)}</small></div>
        </div></section>}
        {tab === "Portfolio" && <section className={styles.panel}><h2>Huidige paper portfolio</h2><p>Cash: {numeric(portfolio.cash)} USD. Waardering per {at(portfolio.as_of)}.</p><div className={styles.scroll}><table><thead><tr>{["Instrument", "Aantal", "Gemiddelde kostprijs", "Marktprijs", "Marktwaarde"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{holdings.length ? holdings.map((h, i) => <tr key={text(h.instrument_id) + i}><td>{text(h.instrument_id)}</td>{["quantity", "average_cost", "market_price", "market_value"].map(k => <td key={k}>{numeric(h[k])}</td>)}</tr>) : <tr><td colSpan={5}>{latest.at ? "Geen open paper posities" : "Nog geen geverifieerde portfolio"}</td></tr>}</tbody></table></div><small>{text(latest.paper_fill_assumptions, "Nog geen fillmodel geregistreerd")}</small></section>}
        {(tab === "Portfolio" || tab === "Analyses") && <section className={styles.panel}><h2>De actuele beleggingsthese</h2><p className={styles.eyebrow}>{holdings.length ? "Open positie · monitoring" : "Research thesis · geen open positie"}</p><p>{text(thesis.base_case, "Nog geen gevalideerde thesis")}</p><details><summary>Invalidatievoorwaarden</summary><ul>{Array.isArray(thesis.invalidation_conditions) && thesis.invalidation_conditions.map((v, i) => <li key={i}>{text(v)}</li>)}</ul></details></section>}
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Besluiten en risicocontroles decisions en risk</h2><p>Geblokkeerd door risico: {data.risk_counts.blocks} · omvang aangepast: {data.risk_counts.resizes}. Confidence is nog niet gekalibreerd.</p><div className={styles.scroll}><table><thead><tr>{["Cycle", "CIO", "Confidence", "Risk", "Paper trade", "Vermogen · USD"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{data.history.length ? data.history.map((r, i) => <tr key={text(r.decision_id) + i}><td>{at(r.at)}</td><td>{text(r.decision_action)}</td><td>{numeric(r.decision_confidence, true)}</td><td>{text(r.risk_status)}</td><td>{bool(r.executed)}</td><td>{numeric(r.equity)}</td></tr>) : <tr><td colSpan={6}>Nog geen voltooide paper cycles</td></tr>}</tbody></table></div><p>Laatste risk reasons: {Array.isArray(latest.risk_reasons) && latest.risk_reasons.length ? latest.risk_reasons.map(v => text(v)).join(" · ") : "Geen geregistreerd"}</p><details><summary>Riskmetingen vóór de laatste beslissing</summary><dl className={styles.details}>{[["Drawdown", numeric(risk.drawdown, true)], ["Portfolio volatiliteit · annualized", numeric(risk.annualized_volatility, true)], ["Quote timestamp", at(risk.data_timestamp)], ["Event risk", bool(latest.event_risk)], ["Exposure compleet", bool(latest.exposure_complete)], ["Risk service beschikbaar", bool(risk.risk_service_available)], ["Broker mismatch", bool(risk.broker_mismatch)]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><small>Vastgelegde inputs van de laatste cycle; huidige marktrisico's kunnen afwijken.</small></details></section>}
        {tab === "Analyses" && <section className={styles.panel}><h2>Wat zeggen de research-agents?</h2><p>{data.research_fixture === false ? "Echte bronnen" : data.research_fixture === true ? "Fixture research" : "Nog geen gevalideerd research"} · {text(data.research_health.status)}. Voorlopige assessments zijn geen uitgevoerde CIO-besluiten.</p><div className={styles.research}>{data.research.map(r => <article key={r.role}><header><strong>{roleDescriptions[r.role]?.[0] || r.role}</strong><span className={r.stale ? styles.stale : ""}>{r.stale ? "Verouderd" : "Binnen 6 uur"}</span></header><p>{roleDescriptions[r.role]?.[1] || "Specialistische beoordeling"}</p><p><strong>{finiteNumber(r.score) === null ? "Richting onbekend" : Number(r.score) > 0 ? "Positief signaal" : Number(r.score) < 0 ? "Negatief signaal" : "Neutraal signaal"}</strong> · score {numeric(r.score)}</p><p>Eigen confidence: {numeric(r.confidence, true)}. Geen gekalibreerde kans op winst.</p><small>{at(r.generated_at)} · oorspronkelijke assessmenttijd</small><details><summary>Lees de oorspronkelijke analyse</summary><p>{r.thesis}</p></details></article>)}</div><small>Bronnen, actuele prijs en risico worden opnieuw gecontroleerd vóór een paper cycle.</small></section>}
        {tab === "Resultaten" && <section className={styles.panel}><h2>Rendement versus de benchmark</h2><p>Hermes wordt vergeleken met SPY op dezelfde observatiemomenten, in USD.</p><div className={styles.performance}>{([["Hermes rendement", metrics.portfolio_return, true], ["Benchmark · SPY", metrics.benchmark_return, true], ["Meer / minder dan SPY", metrics.excess_return, true], ["Sharpe", metrics.sharpe, false], ["Sortino", metrics.sortino, false], ["Maximale terugval", metrics.max_drawdown, true]] as const).map(([label, value, percent]) => <div key={label}><span>{label}</span><strong>{numeric(value, percent)}</strong></div>)}</div><details><summary>Wat betekenen deze cijfers?</summary><p>Sharpe zet rendement af tegen totale schommelingen; Sortino kijkt naar neerwaartse schommelingen. Maximale terugval is de grootste daling vanaf een eerdere piek. Deze maten verschijnen alleen wanneer er voldoende dagelijkse returns zijn; Sortino ontbreekt ook als er geen neerwaartse returns zijn.</p></details></section>}
        {tab === "Resultaten" && <section className={styles.panel}><h2>Hoe betrouwbaar is de confidence?</h2><div className={styles.safety}><div><span>Kalibratiefout (Brier score)</span><strong>{numeric(calibration.brier)}</strong></div><div><span>Rijpe confidence outcomes</span><strong>{text(calibration.samples, "0")} / 20</strong></div><div><span>Observaties</span><strong>{text(metrics.observations, "0")} / 20</strong></div><div><span>Geobserveerde periode</span><strong>{text(metrics.elapsed_days, "0")} / 28 dagen</strong></div></div><p>{text(metrics.status)} · {text(calibration.definition)}</p><small>Sharpe/Sortino vereisen voldoende dagelijkse returns. Geen downside maakt Sortino onbeschikbaar. Benchmark gebruikt dezelfde observatiemomenten en USD. Deze pilot valideert geen beleggingsperformance en geeft geen toestemming voor live trading.</small></section>}
        </ViewTabs>
      </>}
    </div>
  </HermesShell>;
}
