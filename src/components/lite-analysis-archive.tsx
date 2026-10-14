"use client";
import type { LiteSnapshot } from "@/lib/os/g11-lite";
import styles from "./analysis-library.module.css";
const at=(v:string)=>new Intl.DateTimeFormat("nl-NL",{timeZone:"Europe/Amsterdam",dateStyle:"long",timeStyle:"short"}).format(new Date(v));
export function LiteAnalysisArchive({data}:{data:LiteSnapshot}){
  const versions=data.analysis_versions?.map(v=>v.report)||data.research;
  return <><section className={styles.section}><h2>Gecombineerde aandelenanalyses</h2>
    <p>Elk rapport bevat vier gezichtspunten van één model. Het zijn geen vier onafhankelijke agentmeningen.
    De datums hieronder zijn de oorspronkelijke onderzoeksdatums.</p>
    {!versions.length&&<p>Er zijn nog geen gecombineerde rapporten beschikbaar. Een koersscan is geen onderzoeksrapport.</p>}
    {versions.map(r=><article className={styles.report} id={"aandeel-"+r.instrument_id} key={r.report_hash}>
      <h3>{r.instrument_id} · {at(r.generated_at)}</h3><p>{r.thesis_nl}</p>
      {Object.entries(r.viewpoints).map(([role,v])=><div key={role}><h4>{role}</h4>
        <p>{v.summary_nl}</p><ul>{[...v.positive,...v.negative].map((f,i)=><li key={i}>{f.text} <small>Bewijs: {f.evidence_ids.join(", ")}</small></li>)}</ul>
        {v.missing.length>0&&<ul>{v.missing.map((s,i)=><li key={i}>{s}</li>)}</ul>}</div>)}
      <details><summary>Bronnen en oorspronkelijke ophaaldatums</summary>
        {(data.analysis_versions?.find(v=>v.report.report_hash===r.report_hash)?.sources||[]).map((source,i)=><div key={source.id+String(i)}>
          <p><a href={source.url} target="_blank" rel="noreferrer">{source.role} · bekijk de bron</a></p>
          <p>Gepubliceerd: {source.published_at?at(source.published_at):"Datum onbekend"} · opgehaald: {at(source.retrieved_at)}</p>
          <p>Onderstaand fragment komt uit een bron van {source.original_characters} tekens. De volledige bron en hash blijven in het archief bewaard.</p>
          <pre>{source.content}</pre>
        </div>)}
      </details><details><summary>Oorspronkelijke structuur, modelscore en rapportbinding</summary><pre>{JSON.stringify(r,null,2)}</pre></details>
    </article>)}</section>
    <section id="lite-besluiten" className={styles.section}><h2>Nieuwe portefeuille · oorspronkelijke besluiten</h2>
      <p>Alleen afgeronde, gecontroleerde oefencycles. Voorbereidend onderzoek staat hierboven.</p>
      {data.history.length?data.history.map((r,i)=><details key={String(r.record_hash||i)}><summary>{String(r.date)} · {String((r.proposal as Record<string,unknown>)?.instrument_id||"Besluit")}</summary><pre>{JSON.stringify(r,null,2)}</pre></details>):<p>Nog geen afgeronde cyclus in de nieuwe meting.</p>}
    </section><section className={styles.section}><h2>Controles van concrete voorstellen</h2>
      <p>Ook afgewezen voorstellen blijven hier zichtbaar. Een controle is geen uitgevoerde oefentransactie.</p>
      {data.verifications?.length?data.verifications.map(record=><details key={String(record.record_hash)}>
        <summary>{String((record.verifier as Record<string,unknown>).verdict)} · {String((record.verifier as Record<string,unknown>).instrument_id)}</summary>
        <pre>{JSON.stringify(record,null,2)}</pre>
      </details>):<p>Nog geen voorstelcontroles opgeslagen.</p>}
    </section><section id="lite-metingen" className={styles.section}><h2>Meetmethode van de nieuwe portefeuille</h2>
      <p>Een uitkomst wordt gekoppeld aan de vijfde volgende voltooide handelssessie van hetzelfde aandeel.
      De portefeuille begint bij het startkapitaal vóór de eerste oefentransactie; de eerste handelskosten tellen mee. SPY begint op hetzelfde moment.
      De eerdere Microsoft-pilot wordt niet meegeteld.</p>
      <details><summary>Oorspronkelijke meetwaarden en ontbrekende gegevens</summary><pre>{JSON.stringify(data.metrics,null,2)}</pre></details>
    </section></>;
}
