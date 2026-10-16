import React from "react";
import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {CouncilMessageBubble} from "../../components/council-dashboard";
import {humanText,messageText,missingLabel,sourceFigures,archiveDecision} from "./council-presentation";
import type {CouncilArchive,CouncilMessage} from "./council";
const message=(change:Partial<CouncilMessage>={}):CouncilMessage=>({message_id:"m1",role:"FUNDAMENTAL",text_nl:JSON.stringify({text_nl:"De kasstroom ondersteunt onze waardering.",direction:"POSITIVE",confidence:0.72,facts:["trailing_pe: 20"]}),generated_at:"2026-10-15T15:00:00Z",reply_to:null,attempt_id:"a".repeat(64),evidence_refs:["b".repeat(64)],fixture:false,...change});
describe("human investment team",()=>{
 it("renders genuine reply quotes and named analysts without raw model JSON",()=>{
  const first=message();const reply=message({message_id:"m2",role:"QUANT",reply_to:"m1",text_nl:JSON.stringify({text_nl:"Lucas, de volatiliteit vraagt om een kleinere positie.",direction:"NEUTRAL",confidence:0.61})});
  const html=renderToStaticMarkup(<CouncilMessageBubble message={reply} messages={[first,reply]}/>);
  expect(html).toContain("Daan");expect(html).toContain("Lucas");expect(html).toContain('href="#message-m1"');expect(html).toContain("61% zekerheid");expect(html).toContain("Neutraal");expect(html).not.toContain("text_nl");
 });
 it("does not invent an opening or verdict for an old message",()=>{
  expect(messageText(message({text_nl:JSON.stringify({technical_metadata:"secret"})}))).not.toContain("technical_metadata");
 });
 it("translates validator paths and never exposes hashes",()=>{
  const raw="forward_pe:ABSENT_OR_NONPOSITIVE_DENOMINATOR, quote_summary_raw_sha256:ABSENT_OR_NONPOSITIVE_DENOMINATOR "+"b".repeat(64);
  const text=humanText(raw);expect(text).not.toMatch(/sha256|forward_pe|NONPOSITIVE|b{64}/);expect(missingLabel("financial.forward_pe:ABSENT")).toBe("K/W verwacht");
 });
 it("only exposes known numeric source facts with correct units",()=>{
  expect(sourceFigures(JSON.stringify({financial:{trailing_pe:"22",raw_sha256:"a".repeat(64)},quant:{annualized_volatility_252d:0.3}}))).toEqual([{label:"K/W afgelopen jaar",value:"22"},{label:"Volatiliteit · 252 handelsdagen",value:"30%"}]);
 });
});

it("preserves the original research decision after a threaded CIO answer",()=>{
 const original=message({role:"CIO",text_nl:JSON.stringify({decision:"WATCHLIST",trigger_price:665.23})});
 const user=message({message_id:"question",role:"USER"});
 const chat=message({message_id:"message:CHAT:reply",role:"CIO",reply_to:"question",text_nl:JSON.stringify({decision:"BUY_PROPOSAL",trigger_price:999})});
 const legacy=message({...chat,message_id:"old-follow-up"});
 const verify=message({role:"CIO",message_id:"uuid-verify",request_key:"message:VERIFY:example",reply_to:"m1",text_nl:JSON.stringify({decision:"AVOID",trigger_price:500})});
 const archive={messages:[original,user,chat,legacy,verify]} as CouncilArchive;
 expect(archiveDecision(archive).decision).toBe("WATCHLIST");expect(archiveDecision(archive).trigger_price).toBe(665.23);
});
