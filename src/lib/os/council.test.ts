import { describe, expect, it } from "vitest";
import { parseCouncilSnapshot, parseCouncilOpportunities, parseCouncilBriefing } from "./council";

const valid = {
 schema_version: 3, mode: "council", fixture: false, live_orders_enabled: false,
 generated_at: "2026-10-12T12:00:00+00:00",
 counts: { registered: 7000, scanned: 6000, research: 0, paper_days: 0 },
 messages: [], report: null, blockers_nl: ["Bronnen ontbreken."],
 budget: { total_consumed: 0, limit: 12, chat_consumed: 0, chat_limit: 4 },
 stocks: [], next_cursor: null,
};
describe("council snapshot", () => {
 it("keeps scans apart from analyses and paperdays", () => {
   const snapshot = parseCouncilSnapshot(valid);
   expect(snapshot.counts.paper_days).toBe(0);
   expect(snapshot.counts.scanned).toBe(6000);
 });
 it.each([{fixture:true},{live_orders_enabled:true},{mode:"multi-lite"},
          {counts:{...valid.counts,paper_days:-1}},
          {budget:{...valid.budget,total_consumed:13}}])("rejects unsafe provenance %s", change => {
   expect(()=>parseCouncilSnapshot({...valid,...change})).toThrow();
 });
 it.each([12,20,30])("accepts explicitly versioned daily request limit %i", limit=>{
   expect(parseCouncilSnapshot({...valid,budget:{...valid.budget,limit,total_consumed:limit}}).budget.total_consumed).toBe(limit);
 });
 it("rejects any quota beyond the documented maximum",()=>{
   expect(()=>parseCouncilSnapshot({...valid,budget:{...valid.budget,limit:300,total_consumed:0}})).toThrow();
 });
 it("rejects fabricated model messages without physical identity", () => {
   expect(()=>parseCouncilSnapshot({...valid,messages:[{
     message_id:"x",role:"CIO",text_nl:"Koop",generated_at:valid.generated_at,
     attempt_id:null,evidence_refs:[],fixture:false,reply_to:null,
   }]})).toThrow();
 });
});

import { councilQuery } from "./council";
describe("register query",()=>{
 it("preserves search and page safely",()=>{expect(councilQuery("100","small & value")).toBe("cursor=100&q=small+%26+value");});
 it.each(["../secret","-1","100001"])("rejects invalid cursor %s",cursor=>{expect(()=>councilQuery(cursor,"")).toThrow();});
});

it("rejects unknown monetary values instead of showing zero",()=>{expect(()=>parseCouncilSnapshot({...valid,portfolio:{cash:"NaN",total_value:"100000",holdings:[]}})).toThrow();});

it("accepts a separate authenticated technical specialist",()=>{
 expect(parseCouncilSnapshot({...valid,messages:[{
  message_id:"technical",role:"TECHNICAL",text_nl:"Zelfstandige technische analyse.",
  generated_at:valid.generated_at,attempt_id:"a".repeat(64),evidence_refs:["b".repeat(64)],
  fixture:false,reply_to:null,
 }]}).messages[0].role).toBe("TECHNICAL");
});
it("rejects an invalid optional overnight ranking",()=>{
 expect(()=>parseCouncilSnapshot({...valid,overnight:{schema_version:1,generated_at:valid.generated_at,
  counts:{verified_universe:100,enriched:20,complete:200},ranking:[]}})).toThrow();
});

it("accepts the authorized 20-request policy and rejects over-budget use",()=>{
 const budget={...valid.budget,limit:20,total_consumed:13};
 expect(parseCouncilSnapshot({...valid,budget}).budget.limit).toBe(20);
 expect(()=>parseCouncilSnapshot({...valid,budget:{...budget,total_consumed:21}})).toThrow();
 expect(()=>parseCouncilSnapshot({...valid,budget:{...budget,limit:40}})).toThrow();
});

it("validates source-bound screening and rejects invented opportunity values",()=>{
 const item={listing_id:"XNAS:AAPL",symbol:"AAPL",exchange:"XNAS",
   status:"SOURCE_PREFLIGHT_REQUIRED",screening_signal_abs_change:"2.4",
   opportunity_score:null,research_confidence_score:"0.50",
   research_confidence_scope:"IDENTITY_ONLY",valuation_available:false,
   selection_reason:"Verified issuer"};
 const payload={schema_version:1,generated_at:new Date().toISOString(),
   source_status:"VERIFIED_DIRECTORY",
   opportunity_score:"NOT_COMPUTED_MISSING_VALUATION",items:[item]};
 expect(parseCouncilOpportunities(payload).items[0].symbol).toBe("AAPL");
 expect(()=>parseCouncilOpportunities({...payload,items:[{...item,opportunity_score:98}]})).toThrow();
});


it("rejects a 7-part daily briefing with missing verified sections",()=>{
 const order=["executive_summary","research_universe","top_opportunities","agent_council",
   "portfolio_risk","performance","tomorrow_research_queue"];
 const payload={schema_version:1,report_id:"briefing:2026-10-13",report_date:"2026-10-13",
   status:"INCOMPLETE",report_hash:"a".repeat(64),revision_id:"b".repeat(64),
   live_orders_enabled:false,section_order:order,
   sections:Object.fromEntries(order.map(key=>[key,{}]))};
 expect(parseCouncilBriefing(payload).section_order).toHaveLength(7);
 expect(()=>parseCouncilBriefing({...payload,section_order:order.slice(0,6)})).toThrow();
});

it("rejects string quota values",()=>{
 expect(()=>parseCouncilSnapshot({...valid,budget:{...valid.budget,limit:"20"}})).toThrow();
});
