"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HermesShell } from "./hermes-shell";
import type { ShadowSnapshot } from "@/lib/os/g11-shadow";
import { parseShadowSnapshot } from "@/lib/os/g11-shadow";
import { analysisRoles, plainStatus } from "@/lib/os/presentation";
import styles from "./analysis-library.module.css";

type Row = Record<string, unknown>;
const record = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const original = (v: unknown) => v == null || v === "" ? "Niet vastgelegd" : typeof v === "string" ? v : JSON.stringify(v, null, 2);
function date(v: unknown) {
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) : "Tijdstip onbekend";
}

function OriginalThesis({ value }: { value: unknown }) {
  const source = original(value);
  const parts = source.split(/\s*\|\s*(?=[A-Z_]+=)/);
  return <div className={styles.originals}>{parts.map((part, i) => {
    const match = part.match(/^\s*(FUNDAMENTAL|MACRO|QUANT|SENTIMENT)=([\s\S]*)$/);
    return <article key={i}>{match && <h3>{analysisRoles[match[1]]} <small>· {match[1]}</small></h3>}<p>{match ? match[2] : part}</p></article>;
  })}</div>;
}

export function AnalysisLibrary() {
  const [shadow, setShadow] = useState<ShadowSnapshot | null>(null);
  const [runtime, setRuntime] = useState<Row | null>(null);
  const [diagnostics, setDiagnostics] = useState<Row | null>(null);
  const [capabilities, setCapabilities] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const reads = await Promise.allSettled([
        fetch("/api/os/g11-shadow", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("Marktanalyses zijn niet bereikbaar."); return parseShadowSnapshot(await r.json()); }),
        fetch("/api/os/snapshot", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("Ontwikkeltoelichtingen zijn niet bereikbaar."); return record(await r.json()); }),
        fetch("/api/brain/diagnostics", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("Volledige systeemcontroles zijn niet bereikbaar."); return record(await r.json()); }),
        fetch("/api/brain/capabilities", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("Vaardigheidsbeschrijvingen zijn niet bereikbaar."); return record(await r.json()); }),
      ]);
      if (controller.signal.aborted) return;
      setShadow(reads[0].status === "fulfilled" ? reads[0].value as ShadowSnapshot : null);
      setRuntime(reads[1].status === "fulfilled" ? reads[1].value as Row : null);
      setDiagnostics(reads[2].status === "fulfilled" ? reads[2].value as Row : null);
      const inventory = reads[3].status === "fulfilled" ? record(reads[3].value).items : null;
      setCapabilities(Array.isArray(inventory) ? inventory.map(record) : []);
      setErrors(reads.flatMap(r => r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : "Gegevens niet bereikbaar."] : []));
      setLoading(false);
    }
    void load();
    return () => controller.abort();
  }, []);
  const decisions = shadow?.history || [];
  const decision = selected ? decisions.find(row => row.decision_id === selected) : shadow?.latest;
  const thesis = record(decision?.thesis);
  const mission = record(runtime?.mission);
  const source = record(runtime?.sourceSnapshot);
  return <HermesShell active="onderzoek" status={loading ? "Toelichtingen laden…" : errors.length ? "Een deel is niet bereikbaar" : "Vastgelegde toelichtingen"} statusTone={errors.length ? "warn" : "muted"}>
    <div className={styles.library}>
      <header><span className={styles.eyebrow}>Verdieping</span><h1>Uitgebreide analyses</h1><p>Hier staan de volledige teksten van Hermes en zijn onderzoekers, in de taal waarin ze zijn opgeslagen. In de rest van het OS vind je korte Nederlandse uitleg.</p><p>Dit is een leesweergave van vastgelegde informatie. Een analyse voert geen transactie uit.</p></header>
      <nav className={styles.sectionLinks} aria-label="Onderdelen van de uitgebreide analyses"><a href="#besluit">Beleggingsbesluiten</a><a href="#agents">Nieuwste agentanalyses</a><a href="#systeem">Ontwikkeling en systeem</a><a href="#vaardigheden">Vaardigheden</a></nav>
      {loading && <p role="status">Vastgelegde informatie laden…</p>}
      {errors.map(error => <p key={error} role="alert" className={styles.error}>{error}</p>)}
      <section id="besluit" className={styles.section}><h2>De onderbouwing van een beleggingsbesluit</h2><p>Deze teksten horen bij het gekozen besluit. Nieuwere agentanalyses staan apart hieronder.</p>
        {shadow && <><label htmlFor="analysis-decision">Kies een vastgelegd besluit</label><select id="analysis-decision" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Laatste besluit · {date(shadow.latest.at)}</option>{decisions.map(row => <option key={String(row.decision_id)} value={String(row.decision_id)}>{date(row.at)} · {original(record(row.thesis).instrument_id)} · {original(row.decision_action)}</option>)}</select>
          {decision && <><div className={styles.meta}><span>{original(thesis.instrument_id)}</span><span>{date(decision.at)}</span><span>Risicocontrole: {plainStatus(decision.risk_status)}</span></div><h3>Oorspronkelijke onderbouwing</h3><OriginalThesis value={thesis.base_case} /><h3>Oorspronkelijke voorwaarden voor herbeoordeling</h3>{Array.isArray(thesis.invalidation_conditions) ? <ul className={styles.conditions}>{thesis.invalidation_conditions.map((condition, i) => <li key={i}>{original(condition)}</li>)}</ul> : <p>Niet vastgelegd</p>}<details><summary>Risicoredenen, alternatieve scenario's en gebruikte bewijsverwijzingen</summary><pre>{JSON.stringify({ decision_id: decision.decision_id, confidence: decision.decision_confidence, consensus_score: thesis.consensus_score, risk_status: decision.risk_status, risk_reasons: decision.risk_reasons, bull_case: thesis.bull_case, bear_case: thesis.bear_case, evidence_refs: thesis.evidence_refs, research_snapshot_hash: decision.research_snapshot_hash, paper_fill_assumptions: decision.paper_fill_assumptions }, null, 2)}</pre></details></>}
        </>}
        {!loading && !shadow && <p>De beleggingsonderbouwing is momenteel niet beschikbaar.</p>}<Link href="/trading">Terug naar de korte uitleg in Trading →</Link>
      </section>
      <section id="agents" className={styles.section}><h2>Nieuwste agentanalyses</h2><p>Afkomstig uit de opgeslagen Hermes-agentrapporten. Deze rapporten kunnen nieuwer zijn dan het laatste besluit; ze zijn geen uitgevoerde transacties.</p><p>{shadow?.research_fixture === false ? "Herkomst: echte bronnen." : shadow?.research_fixture === true ? "Herkomst: testgegevens." : "Herkomst: nog niet bevestigd."}</p>{shadow?.research.map(report => <article className={styles.report} key={report.role}><h3>{analysisRoles[report.role] || "Aanvullend onderzoek"} <small>· {report.role}</small></h3><div className={styles.meta}><span>{date(report.generated_at)}</span><span>{report.stale ? "Moet worden bijgewerkt" : "Minder dan 6 uur oud bij het ophalen"}</span></div><p>{report.thesis}</p><details><summary>Oorspronkelijke modelscore en zekerheid</summary><p>Score: {report.score} · Confidence: {report.confidence}. Dit is de eigen inschatting van de agent.</p></details></article>)}{!loading && !shadow?.research.length && <p>Geen agentrapporten beschikbaar.</p>}</section>
      <section id="metingen" className={styles.section}><h2>Precieze meetmethode</h2><p>Oorspronkelijke definitie van de modelkalibratie:</p><p>{original(record(shadow?.metrics.calibration).definition)}</p><details><summary>Vastgelegde meetwaarden</summary><pre>{JSON.stringify(shadow?.metrics || {}, null, 2)}</pre></details></section>
      <section id="systeem" className={styles.section}><h2>Ontwikkeling en systeem</h2><p>De volledige opdrachten, toelichtingen en gebeurtenissen uit de onderzoeksomgeving. Dit staat los van de marktanalyses hierboven.</p>{runtime && <><dl>{[["Onderzoeksopdracht", mission.objective], ["Huidig werk", mission.inProgress], ["Volgende stap", mission.next], ["Blokkades", mission.blockers], ["Gevraagde hulp", mission.needsHuman], ["Laatste afgeronde werk", mission.lastCompletedWork], ["Systeemtoelichting", record(runtime.runtime).reason]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{original(value)}</dd></div>)}</dl><details><summary>Oorspronkelijke gebeurtenissen en beslissingen</summary><pre>{JSON.stringify({ events: runtime.events || source.events || source.recentEvents, decisions: source.decisions, lastReview: runtime.lastReview, fixtureReview: runtime.fixtureReview }, null, 2)}</pre></details></>}{!loading && !runtime && <p>De systeemtoelichtingen zijn momenteel niet beschikbaar.</p>}{diagnostics && <details><summary>Volledige systeemcontroles</summary><pre>{JSON.stringify(diagnostics, null, 2)}</pre></details>}<Link href="/onderzoek">Terug naar Onderzoek →</Link></section>
      <section id="vaardigheden" className={styles.section}><h2>Volledige vaardigheidsbeschrijvingen</h2>{capabilities.map((item, i) => <article className={styles.report} key={String(item.id || i)}><h3>{original(item.name)}</h3><p>{original(item.description)}</p><small>{original(item.type)} · {original(item.category)}</small></article>)}{!loading && !capabilities.length && <p>Geen vaardigheidsbeschrijvingen beschikbaar.</p>}<Link href="/instellingen/geavanceerd">Terug naar Hermes verbeteren →</Link></section>
    </div>
  </HermesShell>;
}
