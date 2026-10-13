export type CouncilMessage = {
  message_id: string; role: string; text_nl: string; generated_at: string;
  attempt_id: string | null; evidence_refs: string[]; reply_to: string | null; fixture: false;
};
export type CouncilReport = {
  summary_nl:string; blockers_nl:string[]; decisions:{case_id:string;text_nl:string}[];
  report_date?:string; report_state?:string; generated_at?:string;
};
export type CouncilArchive = {
  fixture:false; case:{case_id:string;status:string;evidence_hash:string};
  evidence:{snapshot_hash:string;sources:{source_hash:string;url:string;published_at:string;retrieved_at:string;content:string;role:string}[]};
  messages:CouncilMessage[];
};
export type CouncilSnapshot = {
  schema_version: 3; mode: "council"; fixture: false; live_orders_enabled: false;
  generated_at: string;
  research_active?: boolean;
  counts: { registered: number; scanned: number; research: number; paper_days: number; matched_registered?:number; source_candidates?:number };
  messages: CouncilMessage[];
  report: CouncilReport | null;
  report_history?: CouncilReport[];
  cases?:{case_id:string;instrument_id:string;generated_at:string;status:string;evidence_hash:string}[];
  job_health?:{status:string;phase:string;started_at:string;finished_at?:string}|null;
  blockers_nl: string[];
  budget: {total_consumed:number;limit:12;chat_consumed:number;chat_limit:4;unfinished_attempts?:{case_id:string;role:string;reserved_at:string;status:string}[]};
  stocks: {listing_id:string;name:string;symbol:string;status_nl:string}[];
  next_cursor: string | null;
  portfolio?: {cash:string;total_value:string;holdings:{instrument_id:string;quantity:string}[]} | null;
  pnl_amount?: string | null;
  safety?: {kill_switch:boolean;pending:boolean};
  metrics?: {hermes_return:string|null;benchmark_return:string|null;sharpe:string|null;sortino:string|null;
    status:string;missing_metrics_nl:string[];confidence_calibration:unknown};
};
const modelRoles = ["FUNDAMENTAL","MACRO","QUANT","SENTIMENT","CIO"];
const roles = [...modelRoles,"USER","SYSTEM","RISK"];
const hash = /^[a-f0-9]{64}$/;
const object = (x: unknown): x is Record<string,unknown> => Boolean(x && typeof x === "object" && !Array.isArray(x));
const count = (x:unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const strings = (x:unknown): x is string[] => Array.isArray(x) && x.every(v=>typeof v === "string");
export function parseCouncilSnapshot(value: unknown): CouncilSnapshot {
  if (!object(value) || value.schema_version !== 3 || value.mode !== "council" ||
      value.fixture !== false || value.live_orders_enabled !== false ||
      typeof value.generated_at !== "string" || !Number.isFinite(Date.parse(value.generated_at)) ||
      !object(value.counts) || !["registered","scanned","research","paper_days"].every(k=>count((value.counts as Record<string,unknown>)[k])) ||
      !object(value.budget) || value.budget.limit !== 12 || value.budget.chat_limit !== 4 ||
      !count(value.budget.total_consumed) || value.budget.total_consumed > 12 ||
      !count(value.budget.chat_consumed) || value.budget.chat_consumed > 4 ||
      !strings(value.blockers_nl) || !Array.isArray(value.messages) ||
      !Array.isArray(value.stocks) || value.stocks.length > 100 ||
      (value.next_cursor !== null && typeof value.next_cursor !== "string")) {
    throw new Error("Ongeldige onderzoeksraadgegevens");
  }
  for (const message of value.messages) {
    if (!object(message) || message.fixture !== false || typeof message.message_id !== "string" ||
        typeof message.role !== "string" || !roles.includes(message.role) ||
        typeof message.text_nl !== "string" || message.text_nl.length > 12000 ||
        typeof message.generated_at !== "string" || !Number.isFinite(Date.parse(message.generated_at)) ||
        !strings(message.evidence_refs) || message.evidence_refs.some(r=>!hash.test(r)) ||
        (message.reply_to !== null && typeof message.reply_to !== "string") ||
        (modelRoles.includes(message.role) && (typeof message.attempt_id !== "string" ||
          !hash.test(message.attempt_id) || message.evidence_refs.length === 0))) {
      throw new Error("Ongeldig agentbericht");
    }
  }
  for (const stock of value.stocks) {
    if (!object(stock) || !["listing_id","name","symbol","status_nl"].every(k=>typeof stock[k] === "string"))
      throw new Error("Ongeldige registerregel");
  }
  if (value.report !== null && (!object(value.report) || typeof value.report.summary_nl !== "string" ||
      !strings(value.report.blockers_nl) || !Array.isArray(value.report.decisions) ||
      value.report.decisions.some(d=>!object(d) || typeof d.case_id !== "string" || typeof d.text_nl !== "string")))
    throw new Error("Ongeldig dagrapport");
  const decimal = (x:unknown): x is string => typeof x === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(x) && Number.isFinite(Number(x));
  if (value.portfolio !== undefined && value.portfolio !== null && (!object(value.portfolio) ||
      !decimal(value.portfolio.cash) || !decimal(value.portfolio.total_value) ||
      !Array.isArray(value.portfolio.holdings) || value.portfolio.holdings.some(h=>!object(h) ||
        typeof h.instrument_id!=="string" || !decimal(h.quantity)))) throw new Error("Ongeldige oefenportefeuille");
  if(value.pnl_amount!==undefined && value.pnl_amount!==null && !decimal(value.pnl_amount)) throw new Error("Ongeldig oefenresultaat");
  if(value.metrics!==undefined && (!object(value.metrics) || typeof value.metrics.status!=="string" ||
     !strings(value.metrics.missing_metrics_nl) || ["hermes_return","benchmark_return","sharpe","sortino"].some(k=>
       (value.metrics as Record<string,unknown>)[k]!==null && !decimal((value.metrics as Record<string,unknown>)[k]))))
    throw new Error("Ongeldige rendementsgegevens");
  return value as unknown as CouncilSnapshot;
}

export function councilQuery(cursor: string = "0", query: string = ""): string {
  if (!/^\d+$/.test(cursor) || Number(cursor) > 100000 || query.length > 100)
    throw new Error("Ongeldige zoekopdracht");
  return new URLSearchParams({cursor:String(Number(cursor)),q:query}).toString();
}

export async function councilRequest(path: "snapshot" | "chat" | "archive", body?: unknown, query: string = ""): Promise<unknown> {
  const base = (process.env.HERMES_BASE_URL || "").replace(/\/$/, "");
  const state = process.env.HERMES_AUTONOMY_STATE_URL || (base ? base + "/autonomy-state/snapshot" : "");
  const key = process.env.HERMES_AUTONOMY_STATE_API_KEY || process.env.HERMES_RESEARCH_API_KEY || "";
  if (!state || !key) throw new Error("De onderzoeksraad is nog niet aangesloten.");
  const url = new URL(state);
  if (url.protocol !== "https:" && !["127.0.0.1","localhost"].includes(url.hostname))
    throw new Error("Ongeldige onderzoeksverbinding");
  if (!url.pathname.endsWith("/snapshot")) throw new Error("Ongeldige onderzoeksverbinding");
  url.pathname = url.pathname.replace(/\/snapshot$/, "/council/" + path);
  url.search = path !== "chat" ? query : ""; url.hash = "";
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST", redirect:"error", cache:"no-store",
    headers:{Authorization:`Bearer ${key}`,Accept:"application/json","Content-Type":"application/json"},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(path === "chat" ? 120_000 : 25_000),
  });
  if (!response.ok) throw new Error("De onderzoeksraad is niet beschikbaar (HTTP " + response.status + ").");
  return response.json();
}

export function parseCouncilArchive(value:unknown, caseId:string):CouncilArchive {
 if(!object(value) || value.fixture!==false || !object(value.case) || value.case.case_id!==caseId ||
    !object(value.evidence) || value.evidence.snapshot_hash!==value.case.evidence_hash ||
    !hash.test(String(value.evidence.snapshot_hash)) || !Array.isArray(value.evidence.sources) ||
    !Array.isArray(value.messages)) throw new Error("Ongeldig onderzoeksarchief");
 for(const source of value.evidence.sources) {
   if(!object(source) || !hash.test(String(source.source_hash)) ||
      !["url","published_at","retrieved_at","content","role"].every(k=>typeof source[k]==="string"))
     throw new Error("Ongeldige archiefbron");
 }
 for(const m of value.messages) {
   if(!object(m) || m.fixture!==false || typeof m.message_id!=="string" ||
      typeof m.role!=="string" || !roles.includes(m.role) || typeof m.text_nl!=="string" ||
      typeof m.generated_at!=="string") throw new Error("Ongeldig archiefbericht");
 }
 return value as unknown as CouncilArchive;
}


export function explainRiskMessage(text:string):string {
 const status=text.match(/De risicocontrole geeft (APPROVE|BLOCK|RESIZE)\./)?.[1];
 const quantity=text.match(/Voorgestelde oefenhoeveelheid: ([0-9.+Ee-]+)\./)?.[1];
 if(!status || quantity===undefined || !Number.isFinite(Number(quantity))) return "Er is een risicocontrole opgeslagen. De volledige registratie staat in het onderzoeksarchief.";
 const reasons:Record<string,string>={
  STALE_OR_FUTURE_DATA:"De gebruikte gegevens zijn te oud of hebben een ongeldige datum.",
  INCOMPLETE_EXPOSURE:"Hermes mist gegevens om het totale portefeuillerisico te controleren.",
  SYSTEM_HALTED:"De veiligheidsstop staat aan.",
  LIQUIDATION_ONLY:"Hermes mag momenteel alleen bestaande posities sluiten.",
  NO_NEW_POSITIONS:"Nieuwe posities zijn tijdelijk geblokkeerd.",
  REDUCE_RISK_ONLY:"Hermes mag momenteel alleen risico afbouwen.",
  EVENT_RISK:"Een belangrijke gebeurtenis of onvoldoende bevestigde gegevens blokkeren dit voorstel.",
  CONFIDENCE_BELOW_MINIMUM:"De zekerheid van de CIO blijft onder de ingestelde ondergrens.",
  DRAWDOWN_LIMIT:"Het verlies vanaf de hoogste portefeuillewaarde is te groot voor extra risico.",
  VOLATILITY_LIMIT:"Hermes vindt de koers te beweeglijk voor de ingestelde risicogrens.",
  NO_RISK_CAPACITY:"Er is geen ruimte meer binnen de grens voor dit aandeel, zijn sector of regio.",
  TARGET_RESIZED_TO_RISK_CAPACITY:"De omvang moet binnen de grens voor dit aandeel, zijn sector of regio blijven."
 };
 const codes=(text.match(/Redenen: (.*?)\. Voorgestelde/)?.[1] || "").split(",").map(s=>s.trim()).filter(Boolean);
 const why=codes.map(code=>reasons[code] || "Er is een aanvullende risicoblokkade. Raadpleeg de volledige registratie.").join(" ");
 if(status==="BLOCK") return "De oefentransactie gaat niet door. "+why;
 if(Number(quantity)===0) return "Hermes stelt geen oefentransactie voor. Er is hier geen aankoop of verkoop om goed te keuren.";
 if(status==="RESIZE") return "Het voorstel is verkleind tot "+quantity.replace(".",",")+" oefenaandelen. "+why+" De laatste controle moet nog volgen.";
 return "Dit oefenvoorstel past binnen de ingestelde risicogrenzen. De laatste controle moet nog bevestigen of de transactie door kan gaan.";
}
