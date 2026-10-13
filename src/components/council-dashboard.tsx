"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HermesShell } from "./hermes-shell";
import { parseCouncilSnapshot, type CouncilSnapshot, type CouncilMessage, type CouncilArchive, parseCouncilArchive } from "@/lib/os/council";
import styles from "./council-dashboard.module.css";

const names: Record<string,string> = { FUNDAMENTAL:"Bedrijfsanalist",MACRO:"Economie",
 QUANT:"Koersanalist",SENTIMENT:"Nieuws en verwachtingen",CIO:"Hoofdbeslisagent",
 USER:"Jij",SYSTEM:"Systeem",RISK:"Risicocontrole"};
const initials: Record<string,string> = { FUNDAMENTAL:"B",MACRO:"E",QUANT:"K",
 SENTIMENT:"N",CIO:"H",USER:"J",SYSTEM:"S",RISK:"R"};
function time(value:string) {
 return new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Amsterdam"}).format(new Date(value));
}
function money(value:string|null|undefined) {
 return value == null ? "Nog niet beschikbaar" : new Intl.NumberFormat("nl-NL",{style:"currency",currency:"USD"}).format(Number(value));
}
function percentage(value:string|null|undefined) {
 return value == null ? "Nog niet beschikbaar" : new Intl.NumberFormat("nl-NL",{style:"percent",maximumFractionDigits:2}).format(Number(value));
}
function Message({message,messages}:{message:CouncilMessage;messages:CouncilMessage[]}) {
 let explanation = message.text_nl;
 let details: Record<string,unknown> | null = null;
 try {
   const parsed:unknown=JSON.parse(message.text_nl);
   if (parsed && typeof parsed==="object" && !Array.isArray(parsed) &&
       typeof (parsed as Record<string,unknown>).text_nl==="string") {
     details=parsed as Record<string,unknown>; explanation=details.text_nl as string;
   }
 } catch { /* User and service messages are ordinary text. */ }
 const target=messages.find(m=>m.message_id===message.reply_to);
 let targetText=target?.text_nl || "";
 try {const parsed=JSON.parse(targetText); targetText=parsed.text_nl || targetText;} catch {}
 return <article id={"message-"+message.message_id} className={styles.message} data-user={message.role==="USER"}>
   <span className={styles.avatar} aria-hidden="true">{initials[message.role]}</span>
   <div className={styles.bubble}>
     <header><strong>{names[message.role] || message.role}</strong>
       <time dateTime={message.generated_at}>{time(message.generated_at)}</time></header>
     {message.reply_to ? <a className={styles.reply} href={"#message-"+message.reply_to}>
       {target ? names[target.role]+": "+targetText.slice(0,180) : "Doelbericht staat in het volledige onderzoeksarchief"}</a> : null}
     <p>{explanation}</p>
     {details ? <details><summary>Feiten, uitleg en onzekerheid</summary>
       {Array.isArray(details.facts) ? <><h4>Feiten uit de bronnen</h4><ul>{details.facts.filter((x):x is string=>typeof x==="string").map((fact,i)=><li key={i}>{fact}</li>)}</ul></> : null}
       <h4>Wat betekent dit?</h4><p>{typeof details.interpretation==="string" ? details.interpretation : "Geen uitleg opgeslagen."}</p>
       <h4>Wat weten we nog niet?</h4><p>{typeof details.uncertainty==="string" ? details.uncertainty : "Geen toelichting opgeslagen."}</p>
     </details> : null}
   </div>
 </article>;
}

export function CouncilDashboard({active="onderzoek"}:{active?:"onderzoek"|"trading"}) {
 const [data,setData]=useState<CouncilSnapshot|null>(null);
 const [error,setError]=useState("");
 const [tab,setTab]=useState<"report"|"agents"|"chat"|"stocks">("report");
 const [question,setQuestion]=useState("");
 const [caseId,setCaseId]=useState("");
 const [archive,setArchive]=useState<CouncilArchive|null>(null);
 const [archiveError,setArchiveError]=useState("");
 const [reportDate,setReportDate]=useState("");
 const [sending,setSending]=useState(false);
 const [sendError,setSendError]=useState("");
 const [cursor,setCursor]=useState("0");
 const [search,setSearch]=useState("");
 const [searchDraft,setSearchDraft]=useState("");
 const request=useRef<{text:string;key:string}|null>(null);
 useEffect(()=>{
   const controller=new AbortController();
   let active=true;
   let inFlight=false;
   async function refresh() {
     if(inFlight) return;
     inFlight=true;
     try {
       const response=await fetch("/api/os/council?"+new URLSearchParams({cursor,q:search}),{cache:"no-store",signal:controller.signal});
       if(!response.ok) throw new Error("De onderzoeksraad is nog niet bereikbaar. De actuele status is onbekend.");
       const next=parseCouncilSnapshot(await response.json());
       if(active) {setData(next);setError("");}
     } catch(e) {
       if(active) setError(e instanceof Error?e.message:"Gegevens ophalen is mislukt.");
     } finally {inFlight=false;}
   }
   void refresh();
   const timer=setInterval(()=>void refresh(),30_000);
   return ()=>{active=false;controller.abort();clearInterval(timer);};
 },[cursor,search]);
 useEffect(()=>{
   if(!caseId) {setArchive(null);return;}
   const controller=new AbortController();
   async function read() {
     try {
       const response=await fetch("/api/os/council/archive?"+new URLSearchParams({case:caseId}),
           {cache:"no-store",signal:controller.signal});
       if(!response.ok) throw new Error("Onderzoeksarchief niet bereikbaar.");
       const result=parseCouncilArchive(await response.json(),caseId);
       if(!controller.signal.aborted) {setArchive(result);setArchiveError("");}
     } catch(e) {if(!controller.signal.aborted) {setArchive(null);setArchiveError(e instanceof Error?e.message:"Archief niet bereikbaar.");}}
   }
   void read();
   return ()=>controller.abort();
 },[caseId]);
 async function send(event:FormEvent) {
   event.preventDefault();
   const text=(caseId ? "Over onderzoek "+caseId+": " : reportDate ? "Over dagrapport "+reportDate+": " : "")+question.trim();
   if(!text || sending || !data || error) return;
   if(!request.current || request.current.text!==text) request.current={text,key:crypto.randomUUID()};
   setSending(true);setSendError("");
   try {
     const response=await fetch("/api/os/council/chat",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({text,request_key:request.current.key}),signal:AbortSignal.timeout(125_000)});
     const result:unknown=await response.json();
     if(!response.ok) throw new Error(
       result && typeof result==="object" && "error" in result && typeof result.error==="string"
       ? result.error : "De CIO kon niet antwoorden. De aanvraag wordt niet automatisch herhaald.");
     setData(parseCouncilSnapshot(result));setQuestion("");request.current=null;
   } catch(e) {setSendError(e instanceof Error?e.message:"Antwoord ophalen is mislukt.");}
   finally {setSending(false);}
 }
 const messages=(tab==="agents" && archive ? archive.messages : data?.messages)?.filter(m=>tab==="chat"
   ? (m as CouncilMessage & {conversation?:string}).conversation==="owner-chat"
   : (m as CouncilMessage & {conversation?:string}).conversation!=="owner-chat") || [];
 const count=data?.counts;
 const reports=data?.report_history || [];
 const selectedReport=reportDate ? reports.filter(r=>r.report_date===reportDate).at(-1) : data?.report;
 return <HermesShell active={active} status={error?"Verbinding controleren":data?"Onderzoeksraad · paper":"Onderzoeksraad laden…"} statusTone={error?"warn":"muted"} wide>
   <div className={styles.heading}><div><span className={styles.eyebrow}>Hermes onderzoeksraad</span>
     <h1>Volg de analyse. Vraag door.</h1><p>Bekijk wat de analisten vinden, waar zij over twijfelen en waarom de CIO een besluit neemt.</p></div>
     <span className={styles.badge}>Alleen paper · geen echte orders</span></div>
   {data && !data.research_active ? <div className={styles.notice}><strong>Research nog niet actief</strong><p>Het register en de status zijn zichtbaar. Agentanalyses en CIO-vragen volgen zodra de operatie is aangesloten en gecontroleerd.</p></div> : null}
   {error ? <div className={styles.notice} role="alert"><strong>Geen actuele verbinding</strong><p>{error}</p>{data?<p>De gegevens hieronder zijn van {time(data.generated_at)}.</p>:null}</div> : null}
   <div className={styles.stats}>{[
     ["In het register",count?.registered,"Ondersteunde Amerikaanse noteringen"],
     ["Koersregels opgehaald",count?.scanned,"Bronregels; koppeling aan het register wordt apart gecontroleerd"],
     ["Onderzoeken afgerond",count?.research,"Vier afzonderlijke analisten en de CIO"],
     ["Echte paperdagen",count?.paper_days,"Gecontroleerde dagelijkse portefeuille"],
   ].map(([label,value,note])=><div key={String(label)}><small>{label}</small><strong>{typeof value==="number"?value.toLocaleString("nl-NL"):"—"}</strong><p>{note}</p></div>)}</div>
   <nav className={styles.tabs} aria-label="Onderzoeksraad">
     {([["report","Dagrapport"],["agents","Agentoverleg"],["chat","Vraag de CIO"],["stocks","Aandelenregister"]] as const).map(([key,label])=>
       <button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}
   </nav>
   <section className={styles.panel}>
   {tab==="report" ? <><h2>Wat heeft Hermes vandaag gedaan?</h2>
     <label htmlFor="report-date">Rapportarchief</label>
     <select id="report-date" value={reportDate} onChange={e=>setReportDate(e.target.value)}>
       <option value="">Vandaag</option>{[...new Set(reports.map(r=>r.report_date).filter(Boolean))].reverse().map(date=>
         <option key={date} value={date}>{date}</option>)}
     </select>
     {selectedReport ? <><p className={styles.lead}>{selectedReport.summary_nl}</p>
       <p>Rapportdatum: {selectedReport.report_date || "onbekend"}. {selectedReport.report_state==="FINAL"?"Afgesloten dagrapport":selectedReport.report_state==="ERROR"?"Controle mislukt":"Voorlopig dagrapport"}.</p>
       {selectedReport.decisions.map(d=><article className={styles.decision} key={d.case_id}><strong>{d.case_id}</strong><p>{d.text_nl}</p></article>)}</>
       : <p>Er is nog geen gecontroleerd dagrapport beschikbaar.</p>}
     {data?.blockers_nl.length ? <><h3>Wat houdt het onderzoek tegen?</h3><ul>{data.blockers_nl.map((b,i)=><li key={i}>{b}</li>)}</ul></> : null}
     {data?.job_health?<p>Laatste taak: {data.job_health.phase==="RESEARCH"?"onderzoek":"papercontrole"}.
       {data.job_health.status==="STARTED"?" Gestart; afronding nog niet bevestigd.":data.job_health.status==="FINISHED"?" Afgerond.":" Mislukt."}</p>:null}
     {data?.budget.unfinished_attempts?.length?<p>Een modelaanvraag is nog niet bevestigd als afgerond. Geen automatische herhaling.</p>:null}
     <h3>De oefenportefeuille</h3>
     {data?.portfolio ? <><div className={styles.stats}>
       <div><small>Totale waarde</small><strong>{money(data.portfolio.total_value)}</strong><p>Cash en oefenposities samen</p></div>
       <div><small>Beschikbaar oefengeld</small><strong>{money(data.portfolio.cash)}</strong><p>Geen echt geld</p></div>
       <div><small>Winst of verlies sinds de start</small><strong>{money(data.pnl_amount)}</strong><p>Inclusief gesimuleerde transactiekosten</p></div>
     </div><ul>{data.portfolio.holdings.map(h=><li key={h.instrument_id}>{h.instrument_id}: {h.quantity} oefenaandelen</li>)}</ul>
     {!data.portfolio.holdings.length?<p>Er zijn geen open oefenposities.</p>:null}</>
       : <p>Er is nog geen gecontroleerde oefendag opgeslagen. Daarom staat hier nog geen portefeuille of rendement.</p>}
     <h3>Hermes naast de benchmark</h3><p>Hermes: {percentage(data?.metrics?.hermes_return)}. SPY: {percentage(data?.metrics?.benchmark_return)}.</p>
     <p className={styles.muted}>SPY meet hier alleen koersrendement, zonder dividend. Er is nog geen conclusie over winstgevendheid.</p>
     {data?.metrics?.missing_metrics_nl.length?<details><summary>Welke metingen ontbreken nog?</summary><ul>{data.metrics.missing_metrics_nl.map((m,i)=><li key={i}>{m}</li>)}</ul></details>:null}
     <p>Veiligheidsstop: {data?.safety ? data.safety.kill_switch || data.safety.pending ? "aan — nieuwe aanvragen en oefentransacties worden tegengehouden" : "uit" : "onbekend"}.</p>
     <p className={styles.muted}>Een scan of analyse telt niet als paperdag. De evaluatie volgt pas na voldoende echte, gecontroleerde dagen.</p>
     <button className={styles.primary} type="button" onClick={()=>setTab("chat")}>Stel een vraag over het rapport</button>
   </> : null}
   {tab==="agents" || tab==="chat" ? <>
     <div className={styles.chatHeading}><div><h2>{tab==="agents"?"Het overleg tussen de analisten":"Jouw gesprek met de CIO"}</h2>
       <p>{tab==="agents"?"Eerst analyseert iedereen zelfstandig. Daarna volgt overleg en een besluit van de CIO.":"Vraag naar de afweging, ontbrekende informatie of het dagrapport."}</p></div>
       {tab==="chat" && data ? <span>{Math.max(0,data.budget.chat_limit-data.budget.chat_consumed)} vragen resterend vandaag</span> : null}</div>
     {tab==="agents" ? <><label htmlFor="case-select">Kies een onderzoek</label>
       <select id="case-select" value={caseId} onChange={e=>setCaseId(e.target.value)}>
         <option value="">Recente berichten</option>{data?.cases?.slice().reverse().map(c=>
           <option key={c.case_id} value={c.case_id}>{c.instrument_id} · {time(c.generated_at)} · {c.status==="RESEARCH_COMPLETE"?"afgerond":c.status==="RESEARCH_STARTED"?"afronding nog onbekend":c.status==="PRELIMINARY"?"bronnen ontbreken":"mislukt"}</option>)}
       </select>{archiveError?<p role="alert">{archiveError}</p>:null}
       {archive?<details><summary>Originele bronnen en uitgebreide onderbouwing</summary>
         <p>Dit archief bevat de originele broninhoud. Uitgebreide bronteksten kunnen Engelstalig zijn.</p>
         {archive.evidence.sources.map(source=><details key={source.source_hash}>
           <summary>{names[source.role] || source.role} · {source.url}</summary>
           <p>Gepubliceerd: {time(source.published_at)}. Opgehaald: {time(source.retrieved_at)}.</p>
           <p>Broncontrole: {source.source_hash}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{source.content}</pre>
         </details>)}
       </details>:null}</>:null}
     <div className={styles.timeline}>{messages.length ? messages.map(m=><Message key={m.message_id} message={m} messages={messages}/>) :
       <div className={styles.empty}><strong>{tab==="agents"?"Nog geen echte agentgesprekken":"Nog geen gesprek met de CIO"}</strong>
         <p>{tab==="agents"?"Hier verschijnen uitsluitend opgeslagen berichten van echte aanvragen.":"Je kunt hier een vraag stellen zodra de onderzoeksraad en de bronnen beschikbaar zijn."}</p></div>}</div>
     {tab==="chat" ? <form onSubmit={send} className={styles.composer}>
       <label htmlFor="cio-question">Jouw vraag</label>
       <textarea id="cio-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={3}
         placeholder="Waarom heeft Hermes vandaag gekozen om af te wachten?" disabled={sending}/>
       <div><small>Een inhoudelijke vraag gebruikt één CIO-aanvraag. Eenvoudige statusvragen gebruiken geen model.</small>
         <button className={styles.primary} disabled={sending || !data || !data.research_active || Boolean(error) || !question.trim() || data.budget.chat_consumed>=4}>
           {sending?"CIO denkt na…":"Verstuur vraag"}</button></div>
       {sendError?<p role="alert">{sendError}</p>:null}
     </form>:null}
   </> : null}
   {tab==="stocks" ? <><h2>Het brede aandelenregister</h2><p>Een vermelding in het register betekent dat Hermes de notering heeft gevonden. Het is nog geen goedgekeurde belegging of afgerond onderzoek.</p>
     <form onSubmit={e=>{e.preventDefault();setCursor("0");setSearch(searchDraft.trim());}} className={styles.composer}>
       <label htmlFor="stock-search">Zoek op naam of symbool</label>
       <input id="stock-search" value={searchDraft} onChange={e=>setSearchDraft(e.target.value)} maxLength={100} placeholder="Bijvoorbeeld ASML of een bedrijfsnaam" />
       <button className={styles.primary}>Zoek in het volledige register</button>
     </form>
     <div className={styles.tableWrap}><table><thead><tr><th>Symbool</th><th>Bedrijf of notering</th><th>Status</th></tr></thead>
     <tbody>{data?.stocks.map(s=><tr key={s.listing_id}><td>{s.symbol}</td><td>{s.name}</td><td>{s.status_nl}</td></tr>)}</tbody></table></div>
     {!data?.stocks.length?<p>Er zijn nog geen registerregels beschikbaar.</p>:null}
     <div className={styles.chatHeading}><button type="button" disabled={Number(cursor)===0} onClick={()=>setCursor(String(Math.max(0,Number(cursor)-100)))}>Vorige 100</button>
       <span>Pagina {Math.floor(Number(cursor)/100)+1}</span>
       <button type="button" disabled={!data?.next_cursor} onClick={()=>data?.next_cursor && setCursor(data.next_cursor)}>Volgende 100</button></div>
   </>:null}
   </section>
 </HermesShell>;
}
