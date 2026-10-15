import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseOvernight, formatResearchMetric } from "./overnight";
import { TopOpportunities } from "../../components/top-opportunities";
const valid = {schema_version:1,generated_at:"2026-10-14T06:00:00Z",status:"COMPLETE",
 counts:{verified_universe:100,enriched:20,complete:12},
 ranking:[{symbol:"ABC",name:"Voorbeeld",currency:"USD",score:71,valuation_score:60,quality_score:80,momentum_score:70,completeness_pct:90,
 financial:{trailing_pe:12.4,forward_pe:null,free_cash_flow_yield:0.032,total_debt:1000},
 quant:{annualized_volatility_252d:0.25,rsi14:63,beta:1.2},
 macro:{treasury_yield_10y_pct:4.2,vix_index:22},missing_fields:["forward_pe"]}]};
describe("stored overnight research",()=>{
 it("retains measured ranks and counts",()=>expect(parseOvernight(valid).counts.complete).toBe(12));
 it.each([{score:Infinity},{completeness_pct:101},{financial:{trailing_pe:"invented"}}])("rejects invalid measurements %s",change=>{
  expect(()=>parseOvernight({...valid,ranking:[{...valid.ranking[0],...change}]})).toThrow();
 });
 it("separates decimal returns from literal macro percent and missing data",()=>{
  expect(formatResearchMetric("free_cash_flow_yield",0.032,"USD")).toBe("3,2%");
  expect(formatResearchMetric("treasury_yield_10y_pct",4.2,"USD")).toBe("4,2%");
  expect(formatResearchMetric("forward_pe",null,"USD")).toBe("Niet beschikbaar");
 });
 it("renders actual score and expandable valuation, risk and missing fields",()=>{
  const html=renderToStaticMarkup(<TopOpportunities data={parseOvernight(valid)}/>);
  expect(html).toContain("Topkansen"); expect(html).toContain("ABC");
  expect(html).toContain("71"); expect(html).toContain("12,4");
  expect(html).toContain("25%"); expect(html).toContain("Niet beschikbaar");
  expect(html).toContain("<details");
 });
 it("does not fabricate opportunities without a persisted result",()=>{
  const html=renderToStaticMarkup(<TopOpportunities/>);
  expect(html).toContain("geen opgeslagen"); expect(html).not.toContain("ABC");
 });
});

it("formats provider macro rates as literal percent and SMA distance as decimal percent",()=>{
 expect(formatResearchMetric("treasury_10y_yield",4.2,"USD")).toBe("4,2%");
 expect(formatResearchMetric("fed_funds_upper",4.5,"USD")).toBe("4,5%");
 expect(formatResearchMetric("sma_200_distance_pct",0.12,"USD")).toBe("12%");
});

it.each([
 ["volatility252",0.2,"20%"],["volatility30d",0.3,"30%"],["return_12m",0.1,"10%"],
 ["fed_funds_target_upper",4.5,"4,5%"],["cpi_inflation_yoy",2.3,"2,3%"],
 ["cash_and_equivalents",1000,"US$ 1.000,00"],
])("formats measured source field %s with documented units",(key,value,expected)=>{
 expect(formatResearchMetric(String(key),Number(value),"USD")).toBe(expected);
});
