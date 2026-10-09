import { parseG11Snapshot } from "./g11-shadow";
import { describe, expect, it } from "vitest";
import { parseLiteSnapshot, liteStatus } from "./g11-lite";

export function validLite() {
  const at = new Date().toISOString();
  return {
    schema_version: 2, strategy_version: "g11-lite-v1", mode: "multi-lite",
    config_hash: "a".repeat(64), generated_at: at, read_only: true,
    live_orders_enabled: false, fixture: false,
    counts: { scan_runs: 1, tracked_stocks: 20, research_reports: 1, paper_days: 0 },
    scan: { as_of: at, rows: Array.from({length:20},(_,i)=>({
      instrument_id: "S"+i, name: "Aandeel "+i, status:"COMPLETE",
      price:"100", change:"0.01", observed_at:at, missing_nl:[] })) },
    research:[], queue:[], latest:null, portfolio:null, history:[],
    metrics:{status:"INCONCLUSIVE",observed_days:0,calendar_span_days:0},
    activation:{research_enabled:false,reasons_nl:["De outputlimiet is niet gegarandeerd."]},
    safety:{kill_switch:false,pending_recovery:false,integrity_verified:true,reconciled:false},
    budget:{limit:2,attempts_consumed:null,blocked:true,reasons_nl:["Oud verbruik is onbekend."]},
    daemon:{scheduler:"RUNNING",checked_at:at}, archive_anchors:[],
  };
}
describe("strict lite snapshot",()=>{
  it("routes v2 without inventing v1 consensus",()=>{
    const result=parseG11Snapshot(validLite());
    expect(result.schema_version).toBe(2);
    expect(result).not.toHaveProperty("consensus_score");
  });
  it("keeps twenty scans, one report and zero paper days distinct",()=>{
    const v=parseLiteSnapshot(validLite());
    expect(v.counts).toEqual({scan_runs:1,tracked_stocks:20,research_reports:1,paper_days:0});
    expect(v.budget.attempts_consumed).toBeNull();
  });
  it.each([
    {fixture:true},{live_orders_enabled:true},{schema_version:1},
    {counts:{scan_runs:true,tracked_stocks:20,research_reports:1,paper_days:0}},
    {budget:{limit:80,attempts_consumed:0,blocked:false,reasons_nl:[]}},
    {generated_at:new Date(Date.now()+86400000).toISOString()},
    {safety:{kill_switch:"false",pending_recovery:false,integrity_verified:true,reconciled:false}},
  ])("rejects invalid safety, versions, future time and caps %j",change=>{
    expect(()=>parseLiteSnapshot({...validLite(),...change})).toThrow();
  });
  it("rejects duplicate symbols and invalid prices",()=>{
    const v=validLite();v.scan.rows[1].instrument_id=v.scan.rows[0].instrument_id;
    expect(()=>parseLiteSnapshot(v)).toThrow();
    const w=validLite();w.scan.rows[0].price="NaN";
    expect(()=>parseLiteSnapshot(w)).toThrow();
  });
});

describe("data freshness",()=>{
  it("never treats a fresh heartbeat as a fresh scan",()=>{
    const v=parseLiteSnapshot(validLite());
    v.scan.as_of=new Date(Date.now()-7200000).toISOString();
    expect(liteStatus(v)).toBe("Koersgegevens verouderd");
  });
  it("shows failed latest job despite intact portfolio",()=>{
    const v=parseLiteSnapshot(validLite());
    v.job_health={status:"FAIL"};
    expect(liteStatus(v)).toBe("Laatste controle mislukt");
  });
});

describe("Decimal wire notation",()=>{
  it.each(["-3.54993141075122372364E-8","0E-27","1e-8","1E+2"])(
    "accepts finite Decimal change %s without dropping the stock overview",change=>{
      const v=validLite();v.scan.rows[0].change=change;
      const result=parseG11Snapshot(v);
      expect(result.schema_version).toBe(2);
      expect(result).toHaveProperty("scan.rows.0.change",change);
    });
  it("accepts finite exponent price while preserving original text",()=>{
    const v=validLite();v.scan.rows[0].price="1.25E+2";
    expect(parseLiteSnapshot(v).scan.rows[0].price).toBe("1.25E+2");
  });
  it.each(["NaN","Infinity","1e309","1e","1e-","0x10","1e2junk"," 1e2"])(
    "rejects malformed or non-finite change %s",change=>{
      const v=validLite();v.scan.rows[0].change=change;
      expect(()=>parseLiteSnapshot(v)).toThrow();
    });
  it.each(["0E-8","-1E+2","1e-999","1e309"])(
    "rejects non-positive or non-finite price %s",price=>{
      const v=validLite();v.scan.rows[0].price=price;
      expect(()=>parseLiteSnapshot(v)).toThrow();
    });
});
