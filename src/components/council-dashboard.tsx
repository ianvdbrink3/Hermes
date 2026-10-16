"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HermesShell } from "./hermes-shell";
import { parseCouncilSnapshot, parseCouncilArchive, explainRiskMessage, type CouncilSnapshot, type CouncilMessage, type CouncilArchive } from "../lib/os/council";
import { team, humanText, messageText, messageDetails, stance, confidence, archiveDecision, decisionLabel, symbolFor, companyName, time, money, sourceFigures } from "../lib/os/council-presentation";
import { TopOpportunities } from "./top-opportunities";
import styles from "./council-dashboard.module.css";

export function CouncilMessageBubble({message,messages,archive,currency="USD"}:{message:CouncilMessage;messages:CouncilMessage[];archive?:CouncilArchive;currency?:string}) {
 const person=team[message.role]||team.SYSTEM;
 const d=messageDetails(message);
 const target=messages.find(m=>m.message_id===message.reply_to);
 const followup=/message:(?:CHAT|VERIFY):/.test(message.request_key||message.message_id)||target?.role==="USER";
 const sources=archive?.evidence.sources.filter(s=>message.evidence_refs.includes(s.source_hash)) || [];
 const facts=Array.isArray(d.facts)?d.facts.filter((f):f is string=>typeof f==="string"):[];
 const figures=sources.flatMap(s=>sourceFigures(s.content,currency));
 return <article id={"message-"+message.message_id} className={styles.message} data-user={message.role==="USER"} data-decision={message.role==="CIO"||message.role==="RISK"}>
  <span className={styles.avatar} style={{background:person.color,color:"white"}} aria-hidden="true">{person.initials}</span>
  <div className={styles.bubble}><header><div><strong style={{color:person.color}}>{person.name}</strong><span className={styles.role}>{person.role}</span></div><time dateTime={message.generated_at}>{time(message.generated_at)}</time></header>
  {target?<a className={styles.reply} href={"#message-"+target.message_id}><strong>{(team[target.role]||team.SYSTEM).name}</strong><span>{messageText(target).slice(0,190)}</span></a>:message.reply_to?<div className={styles.reply}>Reactie op een eerder opgeslagen bericht</div>:null}
  {(stance(d)||confidence(d))?<div className={styles.messageBadges}><span>{stance(d)}</span><span>{confidence(d)}</span></div>:null}
  {message.role==="CIO"&&d.decision&&!followup?<strong className={styles.decisionLabel}>{decisionLabel(d.decision)}</strong>:null}
  <p>{messageText(message)}</p>
  {!followup&&(typeof d.trigger_price==="number"||typeof d.trigger_price==="string")?<p className={styles.trigger}>Herbeoordelen bij {money(d.trigger_price,currency)}</p>:null}
  {(facts.length||sources.length||typeof d.interpretation==="string"||typeof d.uncertainty==="string")?<details><summary>Toon broncijfers</summary>
   {facts.length?<ul>{facts.map((fact,i)=><li key={i}>{humanText(fact)}</li>)}</ul>:null}
   {typeof d.interpretation==="string"?<><h4>De afweging</h4><p>{humanText(d.interpretation)}</p></>:null}
   {typeof d.uncertainty==="string"?<><h4>Onzekerheden</h4><p>{humanText(d.uncertainty)}</p></>:null}
   {figures.length?<dl className={styles.sourceFacts}>{figures.map((f,i)=><div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>:null}
   {sources.map((source,i)=><p key={source.source_hash}><a href={/^https?:\/\//.test(source.url)?source.url:undefined} target="_blank" rel="noreferrer">Bron {i+1} · {(team[source.role]||team.SYSTEM).role}</a><br/><small>Gepubliceerd {time(source.published_at)} · geraadpleegd {time(source.retrieved_at)}</small></p>)}
  </details>:null}
  </div>
 </article>;
}
export function CouncilDashboard({active="onderzoek"}:{active?:"onderzoek"|"trading"}) {
 const [data,setData]=useState<CouncilSnapshot|null>(null);
 const [error,setError]=useState("");
 const [archives,setArchives]=useState<Record<string,CouncilArchive>>({});
 const [archiveErrors,setArchiveErrors]=useState<Record<string,string>>({});
 const [caseId,setCaseId]=useState("");
 const [mobileChatOpen,setMobileChatOpen]=useState(false);
 const [search,setSearch]=useState("");
 const [question,setQuestion]=useState("");
 const [sending,setSending]=useState(false);
 const [sendError,setSendError]=useState("");
 const request=useRef<{text:string;caseId:string;key:string}|null>(null);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  async function refresh(){try{
   const response=await fetch("/api/os/council",{cache:"no-store",signal:controller.signal});
   if(!response.ok) throw new Error("De actuele gegevens zijn tijdelijk niet bereikbaar.");
   const next=parseCouncilSnapshot(await response.json());if(active){setData(next);setError("");}
  }catch{if(active)setError("De actuele gegevens zijn tijdelijk niet bereikbaar. Opgeslagen informatie kan verouderd zijn.");}}
  void refresh();const timer=setInterval(()=>void refresh(),30_000);
  return()=>{active=false;controller.abort();clearInterval(timer);};
 },[]);
 useEffect(()=>{
  if(!data?.cases?.length)return;
  setCaseId(old=>data.cases!.some(c=>c.case_id===old)?old:data.cases!.find(c=>c.case_id===new URLSearchParams(window.location.search).get("case"))?.case_id||data.cases!.at(-1)!.case_id);
  const controller=new AbortController();
  const cases=data.cases.filter(c=>!archives[c.case_id]||c.status!=="RESEARCH_COMPLETE"||c.case_id===caseId);
  async function read(c:{case_id:string}){try{
   const r=await fetch("/api/os/council/archive?"+new URLSearchParams({case:c.case_id}),{cache:"no-store",signal:controller.signal});
   if(!r.ok)throw new Error();
   const a=parseCouncilArchive(await r.json(),c.case_id);
   if(!controller.signal.aborted){setArchives(prev=>({...prev,[c.case_id]:a}));setArchiveErrors(prev=>({...prev,[c.case_id]:""}));}
  }catch{if(!controller.signal.aborted)setArchiveErrors(prev=>({...prev,[c.case_id]:"Het gesprek kan momenteel niet worden geladen."}));}}
  async function batch(){for(let i=0;i<cases.length&&!controller.signal.aborted;i+=3)await Promise.all(cases.slice(i,i+3).map(read));}
  void batch();return()=>controller.abort();
 // Archives are loaded once; subsequent snapshots refresh unfinished threads.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[data?.generated_at]);
 async function send(event:FormEvent){
  event.preventDefault();const text=question.trim();if(!text||sending||!caseId||!data)return;
  if(!request.current||request.current.text!==text||request.current.caseId!==caseId)request.current={text,caseId,key:crypto.randomUUID()};
  const selected=caseId;setSending(true);setSendError("");
  try{
   const response=await fetch("/api/os/council/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,case_id:selected,request_key:request.current.key}),signal:AbortSignal.timeout(125_000)});
   if(!response.ok)throw new Error("De CIO kon nu niet antwoorden. Je vraag wordt niet automatisch opnieuw verstuurd.");
   setData(parseCouncilSnapshot(await response.json()));setQuestion("");request.current=null;
   const r=await fetch("/api/os/council/archive?"+new URLSearchParams({case:selected}),{cache:"no-store"});
   if(!r.ok)throw new Error("Het antwoord is ontvangen; het gesprek wordt bij de volgende verversing bijgewerkt.");
   const a=parseCouncilArchive(await r.json(),selected);setArchives(prev=>({...prev,[selected]:a}));
  }catch(e){setSendError(e instanceof Error?e.message:"Het antwoord is niet beschikbaar.");}finally{setSending(false);}
 }
 const cases=(data?.cases||[]).slice().reverse();
 const selected=cases.find(c=>c.case_id===caseId);
 const archive=archives[caseId];
 const messages=(archive?.messages||[]).slice().sort((a,b)=>Date.parse(a.generated_at)-Date.parse(b.generated_at));
 const symbol=symbolFor(selected?.instrument_id||"");
 const name=companyName(symbol,selected?.name||data?.stocks.find(s=>s.symbol===symbol)?.name);
 const filtered=cases.filter(c=>{const s=symbolFor(c.instrument_id);return (s+" "+companyName(s,c.name||data?.stocks.find(x=>x.symbol===s)?.name)).toLowerCase().includes(search.toLowerCase());});
 return <HermesShell active={active} status={error?"Verbinding controleren":data?"Alleen oefenhandel":"Gegevens laden…"} statusTone={error?"warn":"muted"} wide>
  <div className={styles.heading}><div><span className={styles.eyebrow}>Hermes · jouw beleggingsteam</span><h1>{active==="trading"?"Portefeuille & handel":"De onderzoeksraad"}</h1><p>{active==="trading"?"Je oefenportefeuille, koopvoorwaarden en dagelijkse controles op één plek.":"Lees mee met je analisten. Volg hun afwegingen en vraag door in hetzelfde gesprek."}</p></div><span className={styles.badge}>Paper · geen echte orders</span></div>
  {error?<div className={styles.notice} role="alert">{error}{data?<p>Laatst ontvangen: {time(data.generated_at)}</p>:null}</div>:null}
  {active==="trading"?<TradingContent data={data} archives={archives}/>:<>
   <div className={styles.workspace} data-mobile-chat={mobileChatOpen?"open":"list"}>
    <aside className={styles.conversations} aria-label="Onderzoeken"><div className={styles.listHeading}><h2>Gesprekken <span>{cases.length}</span></h2><label className={styles.srOnly} htmlFor="conversation-search">Zoek een onderzoek</label><input id="conversation-search" placeholder="Zoek bedrijf of aandeel" value={search} onChange={e=>setSearch(e.target.value)}/></div>
     <div className={styles.conversationList}>{filtered.map(c=>{const s=symbolFor(c.instrument_id);const a=archives[c.case_id];const last=a?.messages.at(-1);const decision=archiveDecision(a);
      return <button type="button" className={styles.conversation} key={c.case_id} onClick={()=>{setCaseId(c.case_id);setMobileChatOpen(true);}} aria-current={caseId===c.case_id?"true":undefined}><span className={styles.companyAvatar}>{s.slice(0,2)}</span><span className={styles.conversationBody}><span className={styles.conversationTitle}><strong>{companyName(s,c.name||data?.stocks.find(x=>x.symbol===s)?.name)}</strong><small>{time(c.generated_at)}</small></span><span className={styles.conversationMeta}>{s}<span className={styles.outcome} data-outcome={String(decision.decision||c.decision||"")}>{decision.decision||c.decision?decisionLabel(decision.decision||c.decision):c.status==="RESEARCH_COMPLETE"?"Afgerond":c.status==="RESEARCH_FAILED"?"Niet afgerond":"In onderzoek"}</span></span><span className={styles.preview}>{last?messageText(last):c.text_nl?humanText(c.text_nl):"Het opgeslagen gesprek wordt opgehaald…"}</span></span></button>;})}
      {!cases.length?<p className={styles.empty}>{data?"Er zijn nog geen opgeslagen onderzoeken.":"Onderzoeken laden…"}</p>:!filtered.length?<p className={styles.empty}>Geen onderzoek gevonden.</p>:null}
     </div></aside>
    <section className={styles.thread} aria-label="Groepsgesprek">
     <button className={styles.mobileBack} type="button" onClick={()=>setMobileChatOpen(false)}>← Terug naar overzicht</button>
     {selected?<><header className={styles.threadHeader}><span className={styles.companyAvatar}>{symbol.slice(0,2)}</span><div><h2>{name} <small>{symbol}</small></h2><p>Lucas, Eva, Daan, Mila, Sam · CIO & Victor</p></div><span className={styles.outcome}>{selected.status==="RESEARCH_FAILED"?"Niet afgerond":decisionLabel(archiveDecision(archive).decision)}</span></header>
      <div className={styles.chatTimeline} aria-live="polite"><div className={styles.historyNote}>Opgeslagen onderzoek van {time(selected.generated_at)} · namen zijn de herkenbare rollen van je AI-team</div>{archiveErrors[caseId]?<p role="alert" className={styles.notice}>{archiveErrors[caseId]}</p>:null}
       {messages.map(m=><CouncilMessageBubble key={m.message_id} message={m} messages={messages} archive={archive} currency={data?.overnight?.ranking.find(r=>r.symbol===symbol)?.currency||"USD"}/>)}
       {!messages.length?<p className={styles.empty}>{archive?"Dit onderzoek heeft nog geen opgeslagen berichten.":"Gesprek laden…"}</p>:null}
      </div>
      <form className={styles.threadComposer} onSubmit={send}><label htmlFor="cio-question">Vraag door over {symbol}</label><div><textarea id="cio-question" rows={2} maxLength={2000} placeholder="Stel een vraag aan de CIO of één van de analisten over dit aandeel…" value={question} onChange={e=>setQuestion(e.target.value)} disabled={sending}/><button className={styles.primary} disabled={sending||selected.status!=="RESEARCH_COMPLETE"||!data?.research_active||!question.trim()||Boolean(error)||(data?.budget.chat_consumed||0)>=(data?.budget.chat_limit||4)}>{sending?"CIO denkt na…":"Verstuur ↗"}</button></div>{selected.status!=="RESEARCH_COMPLETE"?<p>Je kunt doorvragen zodra dit onderzoek is afgerond.</p>:null}<small>{data?Math.max(0,data.budget.chat_limit-data.budget.chat_consumed):"—"} vragen vandaag over · de CIO beantwoordt je vraag met de opgeslagen onderzoekscontext.</small>{sendError?<p role="alert">{sendError}</p>:null}</form>
     </>:<div className={styles.empty}>Kies een onderzoek om het teamgesprek te openen.</div>}
    </section>
   </div>
   <details className={styles.universeSummary}><summary>Onderzoeksbereik · {data?.counts.registered.toLocaleString("nl-NL")||"—"} noteringen → {data?.overnight?.counts.enriched.toLocaleString("nl-NL")||"—"} verrijkt → {data?.overnight?.top_opportunities?.length||Math.min(10,data?.overnight?.ranking.length||0)} kansen</summary><TopOpportunities data={data?.overnight}/></details>
  </>}
 </HermesShell>;
}
function TradingContent({data,archives}:{data:CouncilSnapshot|null;archives:Record<string,CouncilArchive>}){
 const seen=new Set<string>();
 const watchlist=(data?.cases||[]).slice().sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at)).filter(c=>{const symbol=symbolFor(c.instrument_id);if(seen.has(symbol))return false;seen.add(symbol);return true;}).map(c=>({c,decision:archiveDecision(archives[c.case_id])})).filter(({decision})=>decision.decision==="WATCHLIST");
 const holdings=data?.portfolio?.holdings||[];
 const positions=data?.paper_portfolio?.positions||[];
 const journal=data?.paper_portfolio?.paper_journal||[];
 return <>
  <div className={styles.stats}>{[
   ["Portefeuillewaarde",money(data?.portfolio?.total_value),"Cash en posities samen"],
   ["Beschikbare cash",money(data?.portfolio?.cash),"Beschikbaar voor oefenposities"],
   ["Open posities",data?.portfolio?String(holdings.length):"—","Resultaat: "+money(data?.pnl_amount)],
   ["Validatiestatus",data?data.counts.paper_days+" / 20":"—","Gecontroleerde paperdagen voltooid"],
  ].map(([label,value,note])=><div key={label}><small>{label}</small><strong>{value}</strong><p>{note}</p></div>)}</div>
  <section className={styles.panel}><h2>Actieve oefenposities</h2>{positions.length?<div className={styles.tableWrap} tabIndex={0} aria-label="Horizontaal scrollbare tabel"><table><thead><tr><th>Aandeel</th><th>Aantal</th><th>Gemiddeld gekocht</th><th>Laatste koers</th><th>Positiewaarde</th><th>Ongerealiseerd resultaat</th></tr></thead><tbody>{positions.map(p=><tr key={p.symbol}><td>{companyName(p.symbol)} <small>{p.symbol}</small></td><td>{Number(p.quantity).toLocaleString("nl-NL")}</td><td>{money(p.average_cost,p.currency)}</td><td>{money(p.market_price,p.currency)}</td><td>{money(p.market_value,p.currency)}</td><td>{money(p.unrealized_pnl,p.currency)}</td></tr>)}</tbody></table></div>:holdings.length?<div className={styles.tableWrap} tabIndex={0} aria-label="Horizontaal scrollbare tabel"><table><thead><tr><th>Aandeel</th><th>Aantal</th></tr></thead><tbody>{holdings.map(h=><tr key={h.instrument_id}><td>{symbolFor(h.instrument_id)}</td><td>{Number(h.quantity).toLocaleString("nl-NL")}</td></tr>)}</tbody></table></div>:<p>{data?.portfolio?"Er zijn geen open posities. De portefeuille bestaat uit cash.":"De portefeuille is nog niet beschikbaar."}</p>}{data?.paper_portfolio?.observed_at?<p className={styles.muted}>Portefeuillecontrole: {time(data.paper_portfolio.observed_at)}</p>:null}</section>
  <section className={styles.panel}><h2>Volglijst & koopvoorwaarden</h2><p className={styles.muted}>Een herbeoordelingsprijs is een aanleiding voor nieuw onderzoek, geen automatische koopopdracht.</p><div className={styles.tableWrap} tabIndex={0} aria-label="Horizontaal scrollbare tabel"><table><thead><tr><th>Aandeel</th><th>Herbeoordelen bij</th><th>Afstand tot laatste slotkoers</th><th>Onderzoek</th></tr></thead><tbody>{watchlist.map(({c,decision})=>{const s=symbolFor(c.instrument_id);const market=data?.overnight?.ranking.find(r=>r.symbol===s);const price=market?.quant.price;const trigger=Number(decision.trigger_price);return <tr key={c.case_id}><td>{companyName(s)} <small>{s}</small></td><td>{money(decision.trigger_price,market?.currency||"USD")}</td><td>{price&&Number.isFinite(trigger)?new Intl.NumberFormat("nl-NL",{style:"percent",maximumFractionDigits:1}).format(trigger/price-1):"Laatste slotkoers niet beschikbaar"}{market?.quote_asof?<><br/><small>Slotkoers van {market.quote_asof}</small></>:null}</td><td><a href={"/onderzoeksraad?case="+encodeURIComponent(c.case_id)}>Bekijk gesprek ↗</a></td></tr>;})}</tbody></table></div>{!watchlist.length?<p>Er zijn nog geen opgeslagen volglijstvoorwaarden geladen.</p>:null}</section>
  <section className={styles.panel}><h2>Paperjournaal & risicocontrole</h2><div className={styles.tableWrap} tabIndex={0} aria-label="Horizontaal scrollbare tabel"><table><thead><tr><th>Datum</th><th>Dagcontrole</th><th>Oefentransactie</th><th>Portefeuillewaarde</th><th>Risicocontrole</th></tr></thead><tbody>{journal.map((j,i)=><tr key={j.date+i}><td>{j.date}</td><td>{humanText(j.status_nl)}</td><td>{j.transaction?<>{j.transaction.side==="BUY"?"Aankoop":j.transaction.side==="SELL"?"Verkoop":"Oefentransactie"} {j.transaction.quantity} {j.transaction.symbol} · {money(j.transaction.fill_price)}<br/><small>Kosten: {money(j.transaction.cost)}</small></>:"Geen transactie"}</td><td>{money(j.portfolio_value)}</td><td>{j.risk_status==="APPROVE"?"Binnen risicogrenzen":j.risk_status==="BLOCK"||j.risk_status==="VETO"?"Afgewezen door risicocontrole":j.risk_status==="RESIZE"?"Omvang aangepast":"Geen transactie beoordeeld"}{j.risk_reasons.length?<p>{j.risk_status==="BLOCK"||j.risk_status==="VETO"?explainRiskMessage("De risicocontrole geeft BLOCK. Redenen: "+j.risk_reasons.join(",")+". Voorgestelde oefenhoeveelheid: 0."):humanText(j.risk_reasons.join(". "))}</p>:null}</td></tr>)}</tbody></table></div>{!journal.length?<p>Er zijn nog geen dagcontroles in dit overzicht geladen.</p>:null}{data?.report_history?.length?<details><summary>Opgeslagen dagrapporten</summary>{data.report_history.map((r,i)=><p key={i}>{r.report_date} · {humanText(r.summary_nl)}</p>)}</details>:null}<p className={styles.muted}>Veiligheidsstop: {data?.safety?(data.safety.kill_switch||data.safety.pending?"actief":"niet actief"):"onbekend"}. De portefeuille toont uitsluitend opgeslagen oefentransacties.</p></section>
 </>;
}
