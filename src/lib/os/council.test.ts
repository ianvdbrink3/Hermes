import { describe, expect, it } from "vitest";
import { parseCouncilSnapshot } from "./council";

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
