"use client";
import Link from "next/link";
import { useState } from "react";
import type { LiteSnapshot,LiteReport } from "@/lib/os/g11-lite";
import { liteStatus } from "@/lib/os/g11-lite";
import { HermesShell } from "./hermes-shell";
import { ViewTabs } from "./view-tabs";
import styles from "./g11-stock-overview.module.css";

type Row=Record<string,unknown>;
const row=(v:unknown):Row=>v&&typeof v==="object"&&!Array.isArray(v)?v as Row:{};
const number=(v:unknown,percent=false)=>{
  if(v===null||v===undefined||v==="")return "Nog niet beschikbaar";
  const n=typeof v==="boolean"?NaN:Number(v);
  return Number.isFinite(n)?new Intl.NumberFormat("nl-NL",{maximumFractionDigits:2,
    style:percent?"percent":"decimal"}).format(n):"Niet beschikbaar";
};
const at=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v))?
  new Intl.DateTimeFormat("nl-NL",{timeZone:"Europe/Amsterdam",day:"numeric",month:"short",
    hour:"2-digit",minute:"2-digit"}).format(new Date(v)):"Nog niet beschikbaar";
const roles:Record<string,string>={FUNDAMENTAL:"Het bedrijf",MACRO:"De economie",
  QUANT:"De koers",SENTIMENT:"Nieuws en verwachtingen"};
const actions:Record<string,string>={BUY:"Voorstel om te kopen",HOLD:"Afwachten",
  REDUCE:"Voorstel om te verkleinen",AVOID:"Voorstel om een bestaande positie te sluiten"};
const triggers:Record<string,string>={NEW_EVENT:"Nieuwe nieuwstitel",
  PRICE_MOVE:"Koersbeweging van minimaal 2%",NEEDS_RESEARCH:"Nog geen onderzoek",
  INITIAL_RESEARCH:"Nog geen onderzoek",MATERIAL_PRICE_MOVE:"Koersbeweging van minimaal 2%"};
const riskReasons:Record<string,string>={
  CONFIDENCE_BELOW_MINIMUM:"De modelzekerheid ligt onder de vereiste 55%.",
  VOLATILITY_LIMIT:"De voorgestelde portefeuille schommelt meer dan de toegestane 35% per jaar.",
  EVENT_RISK:"Een bedrijfsgebeurtenis nadert of de publicatiedatum is niet gecontroleerd.",
  INCOMPLETE_EXPOSURE:"Niet alle posities en risico's zijn bekend.",
  STALE_OR_FUTURE_DATA:"De gebruikte koers is niet actueel genoeg.",
  DRAWDOWN_LIMIT:"De portefeuille is meer dan 10% gedaald vanaf een eerdere piek.",
  NO_RISK_CAPACITY:"De positie-, sector- of landenlimiet laat geen aankoop toe.",
  TARGET_RESIZED_TO_RISK_CAPACITY:"Het voorstel is verkleind vanwege de positie-, sector- of landenlimiet.",
  SYSTEM_HALTED:"De noodstop is actief.",
};
function Research({report}:{report:LiteReport}) {
  return <section className={styles.panel}><h2>Wat heeft Hermes gevonden?</h2>
    <p>{report.thesis_nl}</p><p className={styles.meta}>Onderzocht op {at(report.generated_at)} ·
      {report.stale?" Te oud voor een nieuw besluit":" Minder dan zes uur oud"}.
      Vier gezichtspunten uit één modelanalyse.</p>
    <div className={styles.factors}>{Object.entries(report.viewpoints).map(([key,v])=>
      <article key={key}><h3>{roles[key]||key}</h3><p>{v.summary_nl}</p>
        {v.positive.length>0&&<><h4>Wat helpt?</h4><ul>{v.positive.map((f,i)=><li key={i}>{f.text}</li>)}</ul></>}
        {v.negative.length>0&&<><h4>Wat zit tegen?</h4><ul>{v.negative.map((f,i)=><li key={i}>{f.text}</li>)}</ul></>}
        {v.missing.length>0&&<><h4>Wat ontbreekt?</h4><ul>{v.missing.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
      </article>)}</div><Link href={"/analyses#aandeel-"+report.instrument_id}>Lees het volledige rapport en de bewijsverwijzingen →</Link>
  </section>;
}
export function G11StockOverview({data,onRefresh,busy}:{data:LiteSnapshot;onRefresh:()=>void;busy:boolean}) {
  const [tab,setTab]=useState("Aandelen");
  const [filter,setFilter]=useState("");
  const [selected,setSelected]=useState(data.scan.rows[0]?.instrument_id||"");
  const [history,setHistory]=useState(false);
  const status=liteStatus(data);
  const halted=data.safety.kill_switch||data.safety.pending_recovery||!data.safety.integrity_verified;
  const stock=data.scan.rows.find(s=>s.instrument_id===selected);
  const report=data.research.find(r=>r.instrument_id===selected);
  const queue=data.queue.find(q=>q.instrument_id===selected);
  const holdings=Array.isArray(data.portfolio?.holdings)?data.portfolio.holdings.map(row):[];
  const position=holdings.find(h=>h.instrument_id===selected);
  const latest=row(data.latest),proposal=row(latest.proposal),risk=row(proposal.risk);
  const reasons=Array.isArray(risk.reasons)?risk.reasons.map(String):[];
  const shown=data.scan.rows.filter(s=>(s.instrument_id+" "+s.name).toLowerCase().includes(filter.toLowerCase()));
  return <HermesShell active="trading" status={status} statusTone={halted?"bad":status==="Oefenobservatie actief"?"good":"warn"}>
    <div className={styles.page}><header className={styles.header}><div><span className={styles.eyebrow}>Trading · Oefenportefeuille</span>
      <h1>Welke aandelen volgt Hermes?</h1><p>Koersen volgen kost geen AI-aanroepen. Hermes onderzoekt maximaal één nieuw aandeel per dag.
      Handel met echt geld staat uit.</p></div><button onClick={onRefresh} disabled={busy}>{busy?"Laden…":"Vernieuwen"}</button></header>
      {(halted||!data.activation.research_enabled||status.includes("niet bevestigd")||status.includes("verouderd")||status.includes("mislukt"))&&
        <section role="alert" className={styles.alert}><strong>{status}</strong>
          {halted&&<p>{data.safety.pending_recovery?"Een opslagactie is niet afgerond. Uitvoering blijft gestopt.":"De veiligheidscontrole blokkeert uitvoering."}</p>}
          <ul>{[...data.activation.reasons_nl,...(data.data_health?.reasons_nl||[])].map((reason,i)=><li key={i}>{reason}</li>)}</ul>
          <p>Er wordt geen nieuwe oefenpositie geopend zolang deze blokkades bestaan.</p></section>}
      <section className={styles.cards} aria-label="Voortgang">
        <article><span>Aandelen gevolgd</span><strong>{data.counts.tracked_stocks}</strong><small>Laatste scan: {at(data.scan.as_of)}</small></article>
        <article><span>AI-onderzoeken</span><strong>{data.counts.research_reports}</strong><small>Maximaal één nieuw aandeel per dag</small></article>
        <article><span>Echte observatiedagen</span><strong>{data.counts.paper_days} / 20</strong><small>Ook minimaal 28 kalenderdagen nodig</small></article>
        <article><span>Modelaanroepen vandaag</span><strong>{data.budget.attempts_consumed===null?"Onbekend":data.budget.attempts_consumed+" / 2"}</strong>
          <small>{data.budget.blocked?"Nieuwe aanroepen geblokkeerd":"Mislukte pogingen tellen ook mee"}</small></article>
      </section>
      <ViewTabs items={["Aandelen","Portefeuille","Besluiten","Resultaten"]} active={tab} onChange={setTab}>
      {tab==="Aandelen"&&<><section className={styles.panel}><h2>Volglijst</h2>
        <p>Een bijgewerkte koers is nog geen beleggingsanalyse. Open een aandeel om te zien wat al is onderzocht.</p>
        <label htmlFor="stock-filter">Zoek een aandeel</label><input id="stock-filter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Naam of afkorting"/>
        <div className={styles.scroll}><table><thead><tr><th>Aandeel</th><th>Koers · USD</th><th>Sinds vorige slotkoers</th><th>Onderzoek</th></tr></thead><tbody>
          {shown.map(s=>{const r=data.research.find(r=>r.instrument_id===s.instrument_id);const q=data.queue.find(q=>q.instrument_id===s.instrument_id);
            return <tr key={s.instrument_id} className={s.instrument_id===selected?styles.selected:""}>
              <td><button aria-pressed={s.instrument_id===selected} onClick={()=>setSelected(s.instrument_id)}>{s.instrument_id}<small>{s.name}</small></button></td>
              <td>{s.status==="COMPLETE"?number(s.price):"Koers ontbreekt"}</td><td>{s.status==="COMPLETE"?number(s.change,true):"Onbekend"}</td>
              <td>{r?r.stale?"Onderzoek verouderd":"Onderzocht":q?"Wacht op onderzoek":"Alleen koersscan"}</td></tr>;})}
          {!shown.length&&<tr><td colSpan={4}>Geen aandelen gevonden.</td></tr>}</tbody></table></div>
      </section>{stock&&<section className={styles.panel} aria-live="polite"><h2>{stock.name} · {stock.instrument_id}</h2>
        <p>{position?"Dit aandeel zit in de oefenportefeuille.":"Er is geen open oefenpositie in dit aandeel."}</p>
        <dl className={styles.details}><div><dt>Laatste koers</dt><dd>{number(stock.price)} USD · {at(stock.observed_at)}</dd></div>
          <div><dt>Onderzoeksstatus</dt><dd>{report?report.stale?"Verouderd; geen nieuw besluit mogelijk":"Onderzoek beschikbaar":"Nog niet onderzocht"}</dd></div>
          <div><dt>Waarom in de wachtrij?</dt><dd>{queue?triggers[queue.trigger]||"Er is nieuwe invoer voor onderzoek":"Geen nieuwe onderzoekstaak"}</dd></div>
          <div><dt>Modelzekerheid</dt><dd>{report?number(report.confidence,true):"Nog niet beschikbaar"}</dd></div></dl>
        {stock.missing_nl.length>0&&<><h3>Wat ontbreekt?</h3><ul>{stock.missing_nl.map((x,i)=><li key={i}>{x}</li>)}</ul></>}
        {!report&&<p>Hermes heeft voor dit aandeel nog geen onderbouwd koersbeeld vastgesteld.</p>}</section>}
        {report&&<Research report={report}/>}</>}
      {tab==="Portefeuille"&&<section className={styles.panel}><h2>Huidige oefenportefeuille</h2>
        <p>{data.portfolio?"Beschikbaar geld: "+number(data.portfolio.cash)+" USD. Waardering: "+at(data.portfolio.as_of):"De nieuwe oefenportefeuille heeft nog geen afgeronde marktcyclus."}</p>
        <div className={styles.scroll}><table><thead><tr><th>Aandeel</th><th>Aantal</th><th>Kostprijs · USD</th><th>Waarde · USD</th></tr></thead><tbody>
          {holdings.map(h=><tr key={String(h.instrument_id)}><td>{String(h.instrument_id)}</td><td>{number(h.quantity)}</td><td>{number(h.average_cost)}</td><td>{number(h.market_value)}</td></tr>)}
          {!holdings.length&&<tr><td colSpan={4}>Geen bevestigde open oefenposities.</td></tr>}</tbody></table></div>
        <p>Maximaal 10% per positie, 25% per sector en 50% per land. Hermes controleert de hele voorgestelde portefeuille.</p></section>}
      {tab==="Besluiten"&&<section className={styles.panel}><h2>Laatste afgeronde besluit</h2>
        {data.latest?<><p><strong>{String(proposal.instrument_id)} · {actions[String(proposal.action)]||"Besluit onbekend"}</strong> · {at(latest.observed_at)}</p>
          <p>{latest.execution_status==="PAPER_FILLED"?"Er is een oefentransactie opgeslagen.":"Dit besluit heeft geen oefentransactie opgeleverd."}</p>
          <h3>Uitkomst van de risicocontrole</h3><p>{risk.status==="BLOCK"?"Het voorstel is tegengehouden.":risk.status==="RESIZE"?"Het voorstel is verkleind.":"De voorgestelde omvang paste binnen de risicolimieten."}</p>
          <ul>{reasons.map((x,i)=><li key={i}>{riskReasons[x]||"Een risicovoorwaarde kon niet worden bevestigd."}</li>)}</ul>
          <dl className={styles.details}><div><dt>Jaarlijkse schommelingen · portefeuille</dt><dd>{number(risk.annualized_portfolio_volatility,true)}</dd></div>
            <div><dt>Terugval vanaf eerdere piek</dt><dd>{number(risk.drawdown,true)}</dd></div></dl>
          <Link href="/analyses#lite-besluiten">Bekijk de volledige besluitgegevens →</Link></>:<p>Er is nog geen afgerond besluit in deze nieuwe meting. Koersscans en voorbereidend onderzoek tellen hiervoor niet mee.</p>}
        <h3>Boekhouding en veiligheid</h3><p>Logboek gecontroleerd: {data.safety.integrity_verified?"ja":"niet bevestigd"}. Portefeuille en logboek komen overeen: {data.safety.reconciled?"ja":"nog niet bevestigd"}.
        Noodstop: {data.safety.kill_switch?"actief":"niet actief"}.</p></section>}
      {tab==="Resultaten"&&<section className={styles.panel}><h2>Hoe doet Hermes het?</h2>
        <p>{data.metrics.status==="READY_FOR_REVIEW"?"Er zijn genoeg observatiedagen voor een eerste beoordeling.":"Nog te weinig gegevens voor een beoordeling."}
        {" "+number(data.metrics.observed_days)} dagen over {number(data.metrics.calendar_span_days)} kalenderdagen.</p>
        <dl className={styles.details}>{[["Hermes rendement",data.metrics.hermes_return,true],["SPY rendement",data.metrics.benchmark_return,true],
          ["Grootste terugval",data.metrics.max_drawdown,true],["Sharpe",data.metrics.sharpe,false],["Sortino",data.metrics.sortino,false]].map(([label,v,percent])=>
          <div key={String(label)}><dt>{String(label)}</dt><dd>{number(v,percent===true)}</dd></div>)}</dl>
        <p>SPY gebruikt dezelfde eerste en laatste waarderingsmomenten. Het koersrendement telt uitkeringen niet mee.</p>
        <h3>Hoe betrouwbaar is de modelzekerheid?</h3><p>{data.metrics.confidence_calibration?"Er zijn beoordeelbare uitkomsten; de meetdetails staan bij Uitgebreide analyses.":"Nog onvoldoende afgeronde vijf-sessieresultaten voor confidencekalibratie."}</p>
        <ul>{Array.isArray(data.metrics.missing_metrics_nl)&&data.metrics.missing_metrics_nl.map((x,i)=><li key={i}>{String(x)}</li>)}</ul>
        <Link href="/analyses#lite-metingen">Bekijk de meetmethode en oorspronkelijke cijfers →</Link></section>}
      </ViewTabs>
      {data.pilot&&<section className={styles.panel}><button onClick={()=>setHistory(!history)} aria-expanded={history}>Eerdere Microsoft-pilot {history?"verbergen":"bekijken"}</button>
        {history&&<><p>Dit is de afzonderlijke historische proef. Deze dagen tellen niet mee bij de nieuwe portefeuille.</p>
          <p>{String(data.pilot.metrics.observations??0)} observatie(s). <Link href="/analyses#besluit">Bekijk de oorspronkelijke besluiten →</Link></p></>}</section>}
      <footer className={styles.meta}>Gegevens bijgewerkt: {at(data.generated_at)}. Automatische controle: {at(data.daemon.checked_at)}.</footer>
    </div>
  </HermesShell>;
}
