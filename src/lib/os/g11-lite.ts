import type { ShadowSnapshot } from "./g11-shadow";

export type LiteRow = {
  instrument_id:string; name:string; status:"COMPLETE"|"ERROR";
  price:string|null; change:string|null; observed_at:string|null; missing_nl:string[];
};
export type LiteReport = {
  instrument_id:string; generated_at:string; score:string; confidence:string;
  thesis_nl:string; report_hash:string; source_hash:string; fixture:false; stale:boolean;
  viewpoints:Record<string,{status:"COMPLETE"|"INSUFFICIENT";summary_nl:string;
    positive:{text:string;evidence_ids:string[]}[];negative:{text:string;evidence_ids:string[]}[];
    missing:string[]}>;
};
export type LiteSnapshot = {
  schema_version:2;strategy_version:"g11-lite-v1";mode:"multi-lite";
  checkpoint_at?:string;retrieved_at?:string;
  data_health?:{stale:boolean;scan_age_seconds:number;reasons_nl:string[]};
  job_health?:{status:string;checked_at?:string|null};
  analysis_versions?:{report:LiteReport;snapshot_hash:string;sources:{id:string;role:string;url:string;sha256:string;published_at:string|null;retrieved_at:string;original_scope:string;display_scope:string;original_characters:number;content:string}[]}[];
  verifications?:Record<string,unknown>[];
  config_hash:string;generated_at:string;read_only:true;live_orders_enabled:false;fixture:false;
  counts:{scan_runs:number;tracked_stocks:number;research_reports:number;paper_days:number};
  scan:{as_of:string;rows:LiteRow[]};research:LiteReport[];
  queue:{instrument_id:string;trigger:string;status:string;first_wait_at:string}[];
  latest:Record<string,unknown>|null;portfolio:Record<string,unknown>|null;
  history:Record<string,unknown>[];metrics:Record<string,unknown>;
  activation:{research_enabled:boolean;reasons_nl:string[]};
  safety:{kill_switch:boolean;pending_recovery:boolean;integrity_verified:boolean;reconciled:boolean};
  budget:{day_utc?:string;limit:2;attempts_consumed:number|null;blocked:boolean;reasons_nl:string[]};
  daemon:{scheduler:string;checked_at:string};
  archive_anchors:{path:string;sha256:string}[];
  pilot?:ShadowSnapshot;
};
const roles=["FUNDAMENTAL","MACRO","QUANT","SENTIMENT"];
const obj=(v:unknown):Record<string,unknown>=>{
  if(!v||typeof v!=="object"||Array.isArray(v))throw new Error("Ongeldige observatiegegevens");
  return v as Record<string,unknown>;
};
const text=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=16000;
const list=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(x=>typeof x==="string");
const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const time=(v:unknown,now:number)=>typeof v==="string"&&/[Zz]$|\+00:00$/.test(v)&&
  Number.isFinite(Date.parse(v))&&Date.parse(v)<=now+1000;
const numeric=(v:unknown)=>typeof v==="string"&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v));
function fail():never{throw new Error("Ongeldige observatiegegevens");}

export function parseLiteSnapshot(value:unknown,now=Date.now()):LiteSnapshot {
  const v=obj(value),c=obj(v.counts),s=obj(v.safety),b=obj(v.budget),a=obj(v.activation);
  const scan=obj(v.scan),daemon=obj(v.daemon);
  if(v.schema_version!==2||v.strategy_version!=="g11-lite-v1"||v.mode!=="multi-lite"||
    v.read_only!==true||v.live_orders_enabled!==false||v.fixture!==false||!hash(v.config_hash)||
    !time(v.generated_at,now)||!time(scan.as_of,now)||!time(daemon.checked_at,now)||
    !text(daemon.scheduler)||typeof a.research_enabled!=="boolean"||!list(a.reasons_nl)||
    ["scan_runs","tracked_stocks","research_reports","paper_days"].some(k=>!count(c[k]))||
    Number(c.tracked_stocks)>50||
    ["kill_switch","pending_recovery","integrity_verified","reconciled"].some(k=>typeof s[k]!=="boolean")||
    b.limit!==2||typeof b.blocked!=="boolean"||!list(b.reasons_nl)||
    (b.attempts_consumed!==null&&(!count(b.attempts_consumed)||Number(b.attempts_consumed)>2))||
    !Array.isArray(scan.rows)||scan.rows.length!==c.tracked_stocks||
    !Array.isArray(v.research)||!Array.isArray(v.queue)||!Array.isArray(v.history)||
    !Array.isArray(v.archive_anchors))fail();
  const symbols=new Set<string>();
  for(const item of scan.rows){
    const row=obj(item);
    if(typeof row.instrument_id!=="string"||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.instrument_id)||
      symbols.has(row.instrument_id)||!text(row.name)||!list(row.missing_nl)||
      !["COMPLETE","ERROR"].includes(String(row.status))||
      (row.status==="COMPLETE"&&(!numeric(row.price)||Number(row.price)<=0||
       !numeric(row.change)||!time(row.observed_at,now)))||
      (row.status==="ERROR"&&(row.price!==null||row.change!==null)))fail();
    symbols.add(row.instrument_id);
  }
  const researched=new Set<string>();
  for(const item of v.research){
    const r=obj(item),views=obj(r.viewpoints);
    if(!symbols.has(String(r.instrument_id))||researched.has(String(r.instrument_id))||
      !time(r.generated_at,now)||!numeric(r.score)||Math.abs(Number(r.score))>1||
      !numeric(r.confidence)||Number(r.confidence)<0||Number(r.confidence)>1||
      !text(r.thesis_nl)||!hash(r.report_hash)||!hash(r.source_hash)||
      r.fixture!==false||typeof r.stale!=="boolean"||Object.keys(views).length!==4)fail();
    for(const role of roles){
      const view=obj(views[role]);
      if(!["COMPLETE","INSUFFICIENT"].includes(String(view.status))||!text(view.summary_nl)||
        !list(view.missing)||!Array.isArray(view.positive)||!Array.isArray(view.negative)||
        (view.status==="INSUFFICIENT"&&view.missing.length===0))fail();
      for(const f of [...view.positive,...view.negative]){
        const factor=obj(f);
        if(!text(factor.text)||!list(factor.evidence_ids)||factor.evidence_ids.length===0)fail();
      }
    }
    researched.add(String(r.instrument_id));
  }
  for(const item of v.queue){
    const q=obj(item);
    if(!symbols.has(String(q.instrument_id))||!text(q.trigger)||!text(q.status)||
      !time(q.first_wait_at,now))fail();
  }
  for(const item of v.archive_anchors){
    const anchor=obj(item);
    if(typeof anchor.path!=="string"||!/^research\/[A-Z][A-Z0-9.-]{0,9}\/[a-f0-9]{64}\.json$/.test(anchor.path)||
      !hash(anchor.sha256))fail();
  }
  if(v.checkpoint_at!==undefined&&!time(v.checkpoint_at,now))fail();
  if(v.retrieved_at!==undefined&&!time(v.retrieved_at,now))fail();
  if(b.day_utc!==undefined&&b.day_utc!==new Date(now).toISOString().slice(0,10))fail();
  if(v.job_health!==undefined){
    const job=obj(v.job_health);
    if(!text(job.status)||(job.checked_at!=null&&!time(job.checked_at,now)))fail();
  }
  if(v.data_health!==undefined){
    const health=obj(v.data_health);
    if(typeof health.stale!=="boolean"||typeof health.scan_age_seconds!=="number"||
      health.scan_age_seconds<0||!list(health.reasons_nl))fail();
  }
  if(v.analysis_versions!==undefined){
    if(!Array.isArray(v.analysis_versions)||v.analysis_versions.length>200)fail();
    for(const item of v.analysis_versions){
      const version=obj(item),report=obj(version.report);
      if(!hash(version.snapshot_hash)||!hash(report.report_hash)||report.fixture!==false||
        !time(report.generated_at,now)||!Array.isArray(version.sources))fail();
      for(const item of version.sources){
        const source=obj(item);
        if(!text(source.url)||!String(source.url).startsWith("https://")||!hash(source.sha256)||
          !time(source.retrieved_at,now)||(source.published_at!==null&&!time(source.published_at,now))||
          typeof source.content!=="string"||source.content.length>12000||
          source.display_scope!=="LABELED_EXCERPT"||!count(source.original_characters))fail();
      }
    }
  }
  if(v.verifications!==undefined){
    if(!Array.isArray(v.verifications)||v.verifications.length>1000)fail();
    for(const item of v.verifications){
      const record=obj(item),verifier=obj(record.verifier);
      if(!hash(record.record_hash)||record.fixture!==false||
        !["ACCEPT","REJECT","INSUFFICIENT_EVIDENCE"].includes(String(verifier.verdict))||
        !list(verifier.reasons_nl)||!time(verifier.generated_at,now))fail();
    }
  }
  obj(v.metrics);
  if(v.latest!==null)obj(v.latest);
  if(v.portfolio!==null)obj(v.portfolio);
  for(const item of v.history){
    const row=obj(item);
    if(row.fixture!==false||row.strategy_version!=="g11-lite-v1"||
      row.reconciliation!=="RECONCILED"||!time(row.observed_at,now))fail();
  }
  return v as unknown as LiteSnapshot;
}

export function liteStatus(data:LiteSnapshot,now=Date.now()):string {
  if(data.safety.kill_switch||data.safety.pending_recovery)return "Oefenoperatie gestopt";
  if(!data.safety.integrity_verified)return "Boekhouding vraagt controle";
  if(data.job_health&& !["OK","UNKNOWN"].includes(data.job_health.status))return "Laatste controle mislukt";
  const scanAge=now-Date.parse(data.scan.as_of);
  if(scanAge<0||scanAge>60*60_000||data.data_health?.stale)return "Koersgegevens verouderd";
  const age=now-Date.parse(data.daemon.checked_at);
  if(age<0||age>5*60_000||data.daemon.scheduler!=="RUNNING")return "Automatische controle niet bevestigd";
  if(!data.activation.research_enabled)return "Koersen volgen · onderzoek wacht op informatie";
  return "Oefenobservatie actief";
}
