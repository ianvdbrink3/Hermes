import { explainRiskMessage, type CouncilMessage, type CouncilArchive } from "./council";
import { formatResearchMetric, metricLabels } from "./overnight";
export const team:Record<string,{name:string;role:string;initials:string;color:string}> = {
 FUNDAMENTAL:{name:"Lucas",role:"Fundamenteel analist",initials:"L",color:"#397568"},
 MACRO:{name:"Eva",role:"Macro-econoom",initials:"E",color:"#8062a6"},
 QUANT:{name:"Daan",role:"Quant & risicoanalist",initials:"D",color:"#44769c"},
 TECHNICAL:{name:"Mila",role:"Technisch analist",initials:"M",color:"#b47b35"},
 SENTIMENT:{name:"Sam",role:"Sentiment & nieuwsanalist",initials:"S",color:"#a15c83"},
 CIO:{name:"CIO",role:"Hoofd beleggingsteam",initials:"C",color:"#24675c"},
 RISK:{name:"Victor",role:"Risk Officer",initials:"V",color:"#687484"},
 USER:{name:"Jij",role:"Eigenaar",initials:"J",color:"#24675c"},
 SYSTEM:{name:"Onderzoeksupdate",role:"Opgeslagen gebeurtenis",initials:"H",color:"#687484"},
};
const decisions:Record<string,string>={WATCHLIST:"Op volglijst",BUY_PROPOSAL:"Koopvoorstel",BUY:"Koopvoorstel",AVOID:"Afwijzen",HOLD:"Aanhouden",RESEARCH_MORE:"Nader onderzoek"};
export function decisionLabel(value:unknown){return typeof value==="string"?decisions[value] || "In behandeling":"In behandeling";}
export function humanText(value:unknown):string {
 if(typeof value!=="string") return "";
 return value.replace(/\b[a-f0-9]{64}\b/gi,"[bron gecontroleerd]")
 .replace(/(?:financial|quant|macro)\.([a-z0-9_]+)(?::[A-Z_]+)?/g,(_,key:string)=>metricLabels[key] || "aanvullend gegeven")
 .replace(/\b([a-z][a-z0-9_]*):[A-Z][A-Z_]+\b/g,(_,key:string)=>metricLabels[key] || "aanvullend gegeven ontbreekt")
 .replace(/\b(?:quote_summary_raw_sha256|[a-z]+_[a-z0-9_]+)\b/g,key=>metricLabels[key] || "aanvullend gegeven")
 .replace(/\b(?:BUY_PROPOSAL|RESEARCH_MORE|WATCHLIST|AVOID|HOLD)\b/g,key=>decisions[key])
 .replace(/\b(?:PENDING|FAILED|FINISHED|COMPLETE|APPROVE|BLOCK|RESIZE)\b/g,key=>({PENDING:"in behandeling",FAILED:"niet afgerond",FINISHED:"afgerond",COMPLETE:"voltooid",APPROVE:"goedgekeurd",BLOCK:"geblokkeerd",RESIZE:"omvang aangepast"})[key as "PENDING"])
 .replace(/\b[A-Z][A-Z_]{4,}\b/g,key=>key.includes("_")?"aanvullende controle":key);
}
export function messageDetails(message:CouncilMessage):Record<string,unknown> {
 try {const v:unknown=JSON.parse(message.text_nl);return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}catch{return {};}
}
export function messageText(message:CouncilMessage):string {
 const d=messageDetails(message);
 const plain=typeof d.text_nl==="string"?d.text_nl:typeof d.summary_nl==="string"?d.summary_nl:(Object.keys(d).length||/^[{[]/.test(message.text_nl.trim()))?"Er is een onderzoeksreactie opgeslagen. Bekijk de bijbehorende afweging en broncijfers.":message.text_nl;
 return humanText(message.role==="RISK"?explainRiskMessage(message.text_nl):plain);
}
export function stance(details:Record<string,unknown>):string {
 return ({POSITIVE:"Positief",BULLISH:"Positief",NEUTRAL:"Neutraal",NEGATIVE:"Negatief",BEARISH:"Negatief"} as Record<string,string>)[String(details.direction)] || "";
}
export function confidence(details:Record<string,unknown>):string {
 const n=Number(details.confidence);return details.confidence!=null&&Number.isFinite(n)&&n>=0&&n<=1?Math.round(n*100)+"% zekerheid":"";
}
export function archiveDecision(archive?:CouncilArchive):Record<string,unknown> {
 const userIds=new Set(archive?.messages.filter(x=>x.role==="USER").map(x=>x.message_id)||[]);
 const m=archive?.messages.filter(x=>x.role==="CIO"&&!/message:(?:CHAT|VERIFY):/.test(x.request_key||x.message_id)&&!userIds.has(x.reply_to||"")).findLast(x=>typeof messageDetails(x).decision==="string");
 return m?messageDetails(m):{};
}
export function symbolFor(instrument:string){return instrument.split(":").at(-1)||instrument;}
export const companyNames:Record<string,string>={META:"Meta Platforms",MU:"Micron Technology",BMBL:"Bumble",MSFT:"Microsoft",AAPL:"Apple",NVDA:"NVIDIA"};
export function companyName(symbol:string,name?:string){return companyNames[symbol] || name || symbol;}
export function time(value:string){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Amsterdam"}).format(d):"Tijdstip onbekend";}
export function money(value:unknown,currency="USD"){return value!=null&&Number.isFinite(Number(value))?new Intl.NumberFormat("nl-NL",{style:"currency",currency}).format(Number(value)):"Nog niet beschikbaar";}

export function missingLabel(value:string):string {
 const key=value.split(":")[0].split(".").at(-1)||value;
 if(key.includes("sha256")||key.includes("hash"))return "Controle van de oorspronkelijke bron";
 return metricLabels[key]||"Aanvullend onderzoeksgegeven";
}

export function sourceFigures(content:string,currency="USD"): {label:string;value:string}[] {
 try {
  const root:unknown=JSON.parse(content);
  if(root&&typeof root==="object"&&"currency" in root&&typeof root.currency==="string"&&/^[A-Z]{3}$/.test(root.currency))currency=root.currency;
  const figures:{label:string;value:string}[]=[];
  const visit=(value:unknown,depth:number)=>{
   if(!value||typeof value!=="object"||Array.isArray(value)||depth>4)return;
   for(const [key,v] of Object.entries(value)){
    if(metricLabels[key]&&(typeof v==="number"||typeof v==="string"&&/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v))&&Number.isFinite(Number(v)))figures.push({label:metricLabels[key],value:formatResearchMetric(key,Number(v),currency)});
    else if(v&&typeof v==="object")visit(v,depth+1);
   }
  };visit(root,0);return figures;
 } catch {return [];}
}
