"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HermesShell } from "./hermes-shell";
import type { ShadowSnapshot } from "@/lib/os/g11-shadow";
import { parseG11Snapshot } from "@/lib/os/g11-shadow";
import type { LiteSnapshot } from "@/lib/os/g11-lite";
import { G11StockOverview } from "./g11-stock-overview";
import { shadowCycleHealthy } from "@/lib/os/g11-shadow-status";
import { decisionStory, finiteNumber, explainAssessment, explainRecordedThesis, riskExplanation, plainStatus, explainInvalidation } from "@/lib/os/presentation";
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
  const [snapshot, setData] = useState<ShadowSnapshot | LiteSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    setBusy(true);
    try {
      const response = await fetch("/api/os/g11-shadow", { cache: "no-store", signal });
      if (!response.ok) {
        const fallback = "De observatiegegevens zijn niet bereikbaar. De actuele veiligheidsstatus is onbekend.";
        const failure = await response.json().catch(() => null);
        throw new Error(typeof failure?.error === "string" && failure.error.length <= 250 ? failure.error : fallback);
      }
      const snapshot = parseG11Snapshot(await response.json());
      if (sequence !== requestSequence.current || signal?.aborted) return;
      setData(snapshot); setError("");
    } catch (e) {
      if (signal?.aborted || sequence !== requestSequence.current) return;
      setError(e instanceof Error ? e.message : "Observatiegegevens niet beschikbaar.");
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
  const data = snapshot?.schema_version === 1 ? snapshot : null;
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
  const healthy = !halted && cycleHealthy && schedulerHealthy && daemonFresh && snapshotFresh;
  const status = error ? "Observatiegegevens niet bereikbaar" : !data ? "Observatiegegevens laden" : halted ? "Observatie geblokkeerd" : !daemonFresh || !snapshotFresh ? "Observatiestatus verouderd" : !cycleHealthy || !schedulerHealthy ? "Observatie vraagt controle" : "Oefenobservatie actief";
  const story = decisionStory(latest.decision_action, latest.executed);
  const riskLabels: Record<string, string> = { APPROVE: "Goedgekeurd", BLOCK: "Geblokkeerd", REJECT: "Afgewezen", RESIZE: "Omvang aangepast" };
  const conditions = explainInvalidation(thesis.invalidation_conditions);
  const recorded = explainRecordedThesis(thesis.base_case);

  if (snapshot?.schema_version === 2) return <G11StockOverview data={snapshot} onRefresh={() => void refresh()} busy={busy} />;
  return <HermesShell active="trading" status={status} statusTone={error || halted || data?.health.status === "FAILED" ? "bad" : healthy ? "good" : "warn"}>
    <div className={styles.dashboard}>
      <header className={styles.header}><div><span className={styles.eyebrow}>Trading · Oefenportefeuille</span><h1>Wat doet Hermes met je oefenportefeuille?</h1><p>Hermes onderzoekt echte marktdata en oefent met virtueel geld in dollars. Handel met echt geld staat uit.</p></div><button disabled={busy} onClick={() => void refresh()}>{busy ? "Laden…" : "Vernieuwen"}</button></header>
      {error && <div role="alert" className={styles.alert}>{error}</div>}
      {!data && !error && <p role="status">Gecontroleerde observatiegegevens laden…</p>}
      {data && <>
        {!healthy && <div role="alert" className={styles.alert}><strong>{status}</strong><p>De laatste vastgelegde beslissing staat hieronder als historie. De huidige beschikbaarheid en veiligheid zijn niet volledig bevestigd.</p></div>}
        <div className={styles.badges}><span>Handel met echt geld: uit</span><span>{latest.fixture === false ? "Echte marktdata" : "Nog geen oefenronde"}</span><span>Laatste ronde: {at(latest.at)}</span><span>Gegevens bijgewerkt: {at(data.generated_at)}</span></div>
        <section className={styles.story} aria-label="Laatste beslissing">
          <div><span className={styles.eyebrow}>{text(thesis.instrument_id, "Instrument onbekend")} · Laatste beleggingsbesluit · {at(latest.at)}</span><h2>{story.title}</h2><p>{story.explanation}</p></div>
          <div className={styles.decisionFacts}><div><span>Risicocontrole</span><strong>{riskLabels[String(latest.risk_status)] || "Niet bevestigd"}</strong></div><div><span>Uitkomst</span><strong>{story.execution.replace("Paper transactie", "Oefentransactie").replace("paper transactie", "oefentransactie")}</strong></div><div><span>Zekerheid van Hermes</span><strong>{numeric(latest.decision_confidence, true)}</strong><small>Hoe zeker het model zelf is. Dit is geen kans op winst.</small></div></div>
          <div className={styles.reasoning}><h3>Wat heeft Hermes meegewogen?</h3>{recorded.length ? <ul>{recorded.map(item => <li key={item.role}><strong>{item.title}: {item.direction.toLowerCase()}.</strong> {item.explanation}</li>)}</ul> : <p>Er is nog geen betrouwbare korte uitleg beschikbaar.</p>}<p>{riskExplanation(latest.risk_status, latest.decision_action, latest.executed)}</p><Link href="/analyses#besluit">Lees de volledige onderbouwing →</Link></div>
        </section>
        <section className={styles.metrics} aria-label="Belangrijkste cijfers">
          {([["Oefenvermogen · USD", portfolio.total_value, false], ["Winst / verlies · USD", data.pnl, false], ["Observaties", metrics.observations, false]] as const).map(([label, value, percent]) => <article key={label}><span>{label}</span><strong>{numeric(value, percent)}{label === "Observaties" ? " / 20" : ""}</strong><small>{label === "Observaties" ? "Ook minimaal 28 dagen verzamelen" : label.includes("vermogen") ? "Gesimuleerd kapitaal" : "Sinds start van de observatie"}</small></article>)}
        </section>
        <ViewTabs items={["Samenvatting", "Portfolio", "Analyses", "Resultaten"]} active={tab} onChange={setTab}>
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Wat je nu moet weten</h2><p>{healthy ? "De observatie loopt en de laatste veiligheidscontroles zijn bevestigd." : "De actuele observatie of veiligheidsstatus vraagt controle. Bekijk de controles hieronder."}</p><p>Hermes verzamelt dagelijkse beslissingen om later risico, kwaliteit en rendement te beoordelen. Met {text(metrics.observations)} observatie(s) over {text(metrics.elapsed_days)} dag(en) blijft de evaluatiestatus {metrics.status === "INCONCLUSIVE" ? "nog onvoldoende bewijs" : plainStatus(metrics.status)}. De beschikbare prestatiematen staan onder Resultaten.</p><p>Handel met echt geld staat uit. Tussen oefenrondes kunnen de onderzoekers hun analyse bijwerken. Pas na een afgeronde beslisronde en risicocontrole ontstaat een nieuw besluit.</p></section>}
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Boekhouding en veiligheid</h2><div className={styles.safety}>
          <div><span>Noodstop (kill switch)</span><strong>{safety?.kill_switch === true ? "ACTIEF" : safety?.kill_switch === false ? "Niet actief" : "Onbekend"}</strong></div>
          <div><span>Herstel in afwachting</span><strong>{bool(safety?.pending_recovery)}</strong></div>
          <div><span>Portefeuille en logboek komen overeen</span><strong>{safety?.reconciled ? "Geverifieerd" : "Niet bevestigd"}</strong></div>
          <div><span>Logboek gecontroleerd</span><strong>{bool(safety?.journal_verified)}</strong></div>
          <div><span>Laatste cycluscontrole</span><strong title={text(data.health.status)}>{data.health.status === "DAILY_COMPLETE" ? "Vandaag afgerond" : data.health.status === "PASS" ? "Controle geslaagd" : plainStatus(data.health.status)}</strong><small>{at(data.health.checked_at)}</small></div>
          <div><span>Automatische uitvoering</span><strong>{daemonFresh ? "Actueel" : "Niet actueel / onbekend"}</strong><small>{at(Number.isFinite(daemonAt) ? new Date(daemonAt).toISOString() : null)}</small></div>
        </div></section>}
        {tab === "Portfolio" && <section className={styles.panel}><h2>Huidige oefenportefeuille</h2><p>Beschikbaar geld: {numeric(portfolio.cash)} USD. Waardering per {at(portfolio.as_of)}.</p><div className={styles.scroll}><table><thead><tr>{["Instrument", "Aantal", "Gemiddelde kostprijs", "Marktprijs", "Marktwaarde"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{holdings.length ? holdings.map((h, i) => <tr key={text(h.instrument_id) + i}><td>{text(h.instrument_id)}</td>{["quantity", "average_cost", "market_price", "market_value"].map(k => <td key={k}>{numeric(h[k])}</td>)}</tr>) : <tr><td colSpan={5}>{latest.at ? "Geen open oefenposities" : "Portefeuille nog niet bevestigd"}</td></tr>}</tbody></table></div><small>Transactiekosten en prijsverschillen worden gesimuleerd. <Link href="/analyses#besluit">Bekijk de berekening</Link>.</small></section>}
        {(tab === "Portfolio" || tab === "Analyses") && <section className={styles.panel}><h2>Hoe kijkt Hermes naar dit aandeel?</h2><p>{holdings.length ? "Er is een open oefenpositie. Hermes volgt of de eerdere analyse nog klopt." : "Dit is een onderzochte mogelijkheid. Er is geen open oefenpositie."}</p><div className={styles.research}>{recorded.map(item => <article key={item.role}><h3>{item.title}</h3><strong>{item.direction}</strong><p>{item.explanation}</p></article>)}</div>{!recorded.length && <p>Er is nog geen betrouwbare korte uitleg beschikbaar.</p>}<h3>Wanneer bekijkt Hermes dit opnieuw?</h3><p>De onderstaande uitleg beschrijft de opgeslagen voorwaarden. Hermes moet een nieuw besluit vastleggen voordat een oefentransactie kan volgen.</p><ul>{conditions.length ? conditions.map((condition, i) => <li key={i}>{condition}</li>) : <li>Er zijn geen voorwaarden voor herbeoordeling beschikbaar.</li>}</ul><Link href="/analyses#besluit">Bekijk de oorspronkelijke analyse en voorwaarden →</Link></section>}
        {tab === "Samenvatting" && <section className={styles.panel}><h2>Besluiten en risicocontroles</h2><p>Geblokkeerd door risico: {data.risk_counts.blocks} · omvang aangepast: {data.risk_counts.resizes}. Het is nog niet bekend hoe betrouwbaar de modelzekerheid is.</p><div className={styles.scroll}><table><thead><tr>{["Tijdstip", "Besluit", "Zekerheid", "Risicocontrole", "Oefentransactie", "Vermogen · USD"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{data.history.length ? data.history.map((r, i) => <tr key={text(r.decision_id) + i}><td>{at(r.at)}</td><td title={text(r.decision_action)}>{r.decision_action === "HOLD" ? "Afwachten" : r.decision_action === "BUY" ? "Kopen" : r.decision_action === "SELL" ? "Verkopen" : text(r.decision_action)}</td><td>{numeric(r.decision_confidence, true)}</td><td title={text(r.risk_status)}>{riskLabels[String(r.risk_status)] || "Niet bevestigd"}</td><td>{bool(r.executed)}</td><td>{numeric(r.equity)}</td></tr>) : <tr><td colSpan={6}>Nog geen afgeronde oefenrondes</td></tr>}</tbody></table></div><p>{riskExplanation(latest.risk_status, latest.decision_action, latest.executed)}</p><details><summary>Risicocijfers bij het laatste besluit</summary><dl className={styles.details}>{[["Grootste daling vanaf een eerdere piek", numeric(risk.drawdown, true)], ["Jaarlijkse schommelingen van de portefeuille", numeric(risk.annualized_volatility, true)], ["Tijdstip van de gebruikte koers", at(risk.data_timestamp)], ["Risico rond een gebeurtenis", bool(latest.event_risk)], ["Alle posities meegenomen", bool(latest.exposure_complete)], ["Risicocontrole beschikbaar", bool(risk.risk_service_available)], ["Verschil met de brokeradministratie", bool(risk.broker_mismatch)]].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><small>Vastgelegde cijfers van het laatste besluit; huidige marktrisico's kunnen afwijken.</small></details></section>}
        {tab === "Analyses" && <section className={styles.panel}><h2>Wat zeggen de nieuwste analyses?</h2><p>{data.research_fixture === false ? "Gebaseerd op echte bronnen" : data.research_fixture === true ? "Gebaseerd op testgegevens" : "Herkomst nog niet bevestigd"}. Deze analyses kunnen nieuwer zijn dan het laatste besluit. Ze veranderen dat besluit niet automatisch.</p><div className={styles.research}>{data.research.map(r => { const brief = explainAssessment(r.role, r.thesis, r.score); return <article key={r.role}><header><strong>{brief.title}</strong><span className={r.stale ? styles.stale : ""}>{r.stale ? "Moet worden bijgewerkt" : "Minder dan 6 uur oud"}</span></header><p><strong>{brief.direction}</strong></p><p>{brief.explanation}</p><small>{at(r.generated_at)}</small></article>; })}</div><Link href="/analyses#agents">Lees de volledige agentanalyses →</Link><p>Voor een nieuw besluit controleert Hermes de bronnen, koers en risico's opnieuw.</p></section>}
        {tab === "Resultaten" && <section className={styles.panel}><h2>Rendement versus de benchmark</h2><p>Hermes wordt vergeleken met SPY op dezelfde observatiemomenten, in USD.</p><div className={styles.performance}>{([["Hermes rendement", metrics.portfolio_return, true], ["Benchmark · SPY", metrics.benchmark_return, true], ["Meer / minder dan SPY", metrics.excess_return, true], ["Sharpe", metrics.sharpe, false], ["Sortino", metrics.sortino, false], ["Maximale terugval", metrics.max_drawdown, true]] as const).map(([label, value, percent]) => <div key={label}><span>{label}</span><strong>{numeric(value, percent)}</strong></div>)}</div><details><summary>Wat betekenen deze cijfers?</summary><p>Sharpe zet rendement af tegen totale schommelingen; Sortino kijkt naar neerwaartse schommelingen. Maximale terugval is de grootste daling vanaf een eerdere piek. Deze maten verschijnen alleen wanneer er voldoende dagelijkse rendementen zijn; Sortino ontbreekt ook als er geen neerwaartse returns zijn.</p></details></section>}
        {tab === "Resultaten" && <section className={styles.panel}><h2>Hoe betrouwbaar is de modelzekerheid?</h2><div className={styles.safety}><div><span>Kalibratiefout (Brier score)</span><strong>{numeric(calibration.brier)}</strong></div><div><span>Besluiten waarvan de uitkomst bekend is</span><strong>{text(calibration.samples, "0")} / 20</strong></div><div><span>Observaties</span><strong>{text(metrics.observations, "0")} / 20</strong></div><div><span>Geobserveerde periode</span><strong>{text(metrics.elapsed_days, "0")} / 28 dagen</strong></div></div><p>{plainStatus(metrics.status)}. We vergelijken later de opgegeven zekerheid met de werkelijke uitkomst. Daarvoor zijn minstens 20 beoordeelbare besluiten nodig.</p><Link href="/analyses#metingen">Bekijk de precieze meetmethode →</Link><small>Sharpe/Sortino vereisen voldoende dagelijkse rendementen. Zonder negatieve rendementen kan Sortino niet worden berekend. Benchmark gebruikt dezelfde observatiemomenten en USD. Deze proef bewijst nog niet dat Hermes goed belegt. Handel met echt geld blijft uit.</small></section>}
        </ViewTabs>
      </>}
    </div>
  </HermesShell>;
}
