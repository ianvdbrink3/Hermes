"use client";
import { useEffect, useState } from "react";
import { HermesShell } from "./hermes-shell";
import { count, numeric, readObservation, row, text, texts, monitoringCheck, type Observation } from "@/lib/os/observation";
import styles from "./observation-dashboard.module.css";

const number = (v: unknown) => count(v)?.toLocaleString("nl-NL") ?? "Onbekend";
const percent = (v: unknown) => { const n = numeric(v); return n === null ? "Onbekend" : new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 2 }).format(n); };
const dollars = (v: unknown) => { const n = numeric(v); return n === null ? "Onbekend" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" }).format(n); };
const date = (v: string | null) => v ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "Onbekend";
const checks = [["heartbeat", "Scheduler"], ["observation_monitor", "Automatische monitor"], ["source_scan", "Marktgegevens"], ["research", "Onderzoek"], ["paper_day", "Paperdag"], ["daily_close", "Dagafsluiting"]] as const;

export function ObservationDashboard() {
  const [data, setData] = useState<Observation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return; busy = true;
      try {
        const result = await readObservation(controller.signal);
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (e) {
        if (!controller.signal.aborted) { setError(e instanceof Error && e.message.startsWith("Log opnieuw in") ? e.message : "De actuele evaluatie is tijdelijk niet bereikbaar of niet controleerbaar."); setData(null); }
      } finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);
  const m = data?.monitor, e = data?.evaluation, gate = row(e?.gate), metrics = row(e?.metrics), execution = row(e?.execution), coverage = row(e?.coverage);
  const unknownChecks = checks.some(([key]) => !["COMPLETE", "PENDING"].includes(String(row(row(m?.checks)[key]).state)));
  const warning = !!error || !!data?.stale || m?.status !== "HEALTHY" || !e || unknownChecks;
  const incidents = Array.isArray(m?.incidents) ? m.incidents.map(row) : [];
  const days = count(gate.observed_days), span = count(gate.calendar_span_days);
  return <HermesShell active="onderzoek" status={loading ? "Evaluatie laden…" : warning ? "Controleer de aandachtspunten" : "Gecontroleerde processen op schema"} statusTone={loading ? "muted" : warning ? "warn" : "good"}>
    <div className={styles.page}>
      <header><span className={styles.eyebrow}>Observeren · meten · beoordelen</span><h1>Hoe presteert Hermes werkelijk?</h1><p>Volg de betrouwbaarheid van het onderzoek en de resultaten van oefentransacties. Het afronden van de observatieperiode schakelt live trading nooit automatisch in.</p><small>Laatst gecontroleerd: {date(data?.generatedAt ?? null)} · Nederlandse tijd</small></header>
      {loading ? <p role="status">Gecontroleerde gegevens laden…</p> : null}
      {error ? <p role="alert" className={styles.notice}>{error} Er worden geen eerdere cijfers als actueel getoond.</p> : null}
      {data?.stale ? <p role="alert" className={styles.notice}>Deze gegevens zijn ouder dan tien minuten. De huidige toestand is niet bevestigd.</p> : null}
      {!loading && !m ? <p role="alert" className={styles.notice}>De monitoringgegevens ontbreken of konden niet worden gecontroleerd. De systeemstatus is onbekend.</p> : null}
      <section className={styles.card}><h2>Dagelijkse betrouwbaarheid</h2><p>{m ? text(m.summary_nl) : "Nog geen geverifieerde status beschikbaar."}</p>
        <div className={styles.checks}>{checks.map(([key, label]) => <div key={key}><span>{label}</span><strong>{monitoringCheck(row(m?.checks)[key]).label}</strong><small>{monitoringCheck(row(m?.checks)[key]).context}</small></div>)}</div>
        {incidents.length ? <ul className={styles.notices}>{incidents.map((incident, i) => <li key={i}>{text(incident.message_nl, "Een controle vraagt aandacht; de toelichting ontbreekt.")}</li>)}</ul> : null}
      </section>
      <section className={styles.card}><h2>De observatieperiode</h2><p>{e ? text(e.summary_nl) : data?.unavailableReason ?? "De evaluatiegegevens zijn niet beschikbaar of niet controleerbaar. Er wordt geen nulstand aangenomen."}</p>
        <div className={styles.progressGrid}><div><strong>{days === null ? "Onbekend" : days} <small>/ 20 paperdagen</small></strong><progress aria-label="Geldige paperdagen" max={20} value={days ?? undefined} /><p>Alleen bevestigde, gereconcilieerde dagen tellen mee.</p></div><div><strong>{span === null ? "Onbekend" : span} <small>/ 28 kalenderdagen</small></strong><progress aria-label="Kalenderdagen observatie" max={28} value={span ?? undefined} /><p>Beide voorwaarden en recente reconciliatie zijn nodig.</p></div></div>
        <p className={styles.notice}>{gate.status === "READY_FOR_REVIEW" ? "Gereed voor menselijke beoordeling. Dit bewijst geen winstgevendheid." : "Nog niet gereed voor beoordeling."} Geen automatische overstap naar live trading.</p>
      </section>
      <section className={styles.card}><h2>Onderzoek is nog geen transactie</h2><div className={styles.metrics}><div><span>Afgerond onderzoek, totaal</span><strong>{number(coverage.completed_total)}</strong></div><div><span>Afgerond in zichtbare raadcases</span><strong>{number(row(e?.counts).completed_visible_cases)}</strong></div><div><span>Werkelijke oefenvullingen</span><strong>{number(execution.filled_transactions)}</strong></div><div><span>Onderzoeksgeschikte noteringen</span><strong>{number(coverage.research_eligible)}</strong></div></div><p>{text(coverage.note_nl, "De zichtbare raadcases zijn geen bewijs van uitgevoerde transacties.")}</p>
        {execution.filled_transactions === 0 ? <p className={styles.notice}>Er zijn nog geen oefentransacties uitgevoerd. Cash aanhouden en watchlistbesluiten bewijzen geen handelsvoordeel.</p> : null}
        <p>{text(execution.basis_nl, "Brokeruitvoering is niet aangetoond.")}</p>
      </section>
      <section className={styles.card}><h2>Resultaten en ontbrekend bewijs</h2><div className={styles.metrics}>{[["Hermes rendement", percent(metrics.hermes_return)], ["Benchmarkrendement (SPY)", percent(metrics.benchmark_return)], ["Maximale terugval", percent(metrics.max_drawdown)], ["Transactiekosten", dollars(execution.cost_total)], ["Slippage", dollars(execution.slippage_total)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p>De benchmark gebruikt koersrendement zonder dividend. Ontbrekende kosten en slippage worden nooit als nul behandeld.</p><p>Een bewezen handelsvoordeel is nog niet vastgesteld.</p><ul className={styles.notices}>{texts(e?.missing_nl).map((message, i) => <li key={i}>{message}</li>)}</ul></section>
    </div>
  </HermesShell>;
}
