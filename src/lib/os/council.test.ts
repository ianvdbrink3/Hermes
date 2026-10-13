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
