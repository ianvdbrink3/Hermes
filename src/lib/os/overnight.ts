export type ResearchMetrics = Record<string, number | null>;
export type Opportunity = {
 symbol:string; name:string; currency:string; score:number|null;
 valuation_score:number|null; quality_score:number|null; momentum_score:number|null;
 completeness_pct:number; financial:ResearchMetrics; quant:ResearchMetrics; macro:ResearchMetrics;
 missing_fields:string[];
};
export type OvernightResearch = {
 schema_version:1; generated_at:string; counts:{verified_universe:number;enriched:number;complete:number};
 ranking:Opportunity[]; status?:string; morning_report?:string;
};
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v && typeof v==="object" && !Array.isArray(v));
const finite=(v:unknown)=>v===null || typeof v==="number" && Number.isFinite(v);
export function parseOvernight(value:unknown):OvernightResearch {
 const fail=()=>{throw new Error("Ongeldige nachtelijke onderzoeksgegevens");};
 if(!object(value) || value.schema_version!==1 || typeof value.generated_at!=="string" ||
  !Number.isFinite(Date.parse(value.generated_at)) || !object(value.counts) || !Array.isArray(value.ranking)) return fail();
 const c=value.counts;
 if(!["verified_universe","enriched","complete"].every(k=>typeof c[k]==="number" && Number.isSafeInteger(c[k]) && c[k]>=0) ||
  Number(c.complete)>Number(c.enriched) || Number(c.enriched)>Number(c.verified_universe)) return fail();
 if(value.status!==undefined && typeof value.status!=="string" || value.morning_report!==undefined && typeof value.morning_report!=="string") return fail();
 for(const row of value.ranking){
  if(!object(row) || !["symbol","name","currency"].every(k=>typeof row[k]==="string" && row[k]!=="") ||
   !/^[A-Z]{3}$/.test(String(row.currency)) || !["score","valuation_score","quality_score","momentum_score"].every(k=>finite(row[k])) ||
   typeof row.completeness_pct!=="number" || !Number.isFinite(row.completeness_pct) || row.completeness_pct<0 || row.completeness_pct>100 ||
   !Array.isArray(row.missing_fields) || !row.missing_fields.every(x=>typeof x==="string")) return fail();
  for(const group of ["financial","quant","macro"]){
   if(!object(row[group]) || !Object.values(row[group]).every(finite)) return fail();
  }
 }
 return value as unknown as OvernightResearch;
}
const decimalPercent=new Set(["free_cash_flow_yield","fcf_yield","roe","operating_margin","revenue_growth","net_margin","volatility252","volatility30d","return_12m","sma20_distance",
 "annualized_volatility_252d","volatility_252d","volatility_30d","max_drawdown_1y","return_1m","return_3m","return_6m","return_1y","sma50_distance","sma200_distance","distance_sma50","distance_sma200","sma_50_distance_pct","sma_200_distance_pct"]);
const literalPercent=new Set(["treasury_yield_10y_pct","fed_funds_rate_pct","completeness_pct","treasury_10y_yield","treasury_13w_yield","fed_funds_lower","fed_funds_upper","fed_funds_target_lower","fed_funds_target_upper","cpi_inflation_yoy"]);
const cash=new Set(["total_debt","cash","cash_and_equivalents","total_equity","sma20","net_debt","free_cash_flow","market_cap","enterprise_value","sma50","sma200","price"]);
export function formatResearchMetric(key:string,value:number|null|undefined,currency:string):string {
 if(value==null || !Number.isFinite(value)) return "Niet beschikbaar";
 if(decimalPercent.has(key)) return new Intl.NumberFormat("nl-NL",{style:"percent",maximumFractionDigits:2}).format(value);
 if(literalPercent.has(key)) return new Intl.NumberFormat("nl-NL",{maximumFractionDigits:2}).format(value)+"%";
 if(cash.has(key)) return new Intl.NumberFormat("nl-NL",{style:"currency",currency,maximumFractionDigits:2}).format(value);
 return new Intl.NumberFormat("nl-NL",{maximumFractionDigits:2}).format(value);
}
export const metricLabels:Record<string,string>={
 cash_and_equivalents:"Kaspositie",total_equity:"Eigen vermogen",ev_to_ebitda:"EV / EBITDA",price_to_free_cash_flow:"Koers / vrije kasstroom",net_margin:"Nettomarge",net_debt_to_ebitda:"Nettoschuld / EBITDA",debt_to_equity:"Schuld / eigen vermogen",current_ratio:"Liquiditeit (current ratio)",price_to_book:"Koers / boekwaarde",
 volatility252:"Volatiliteit · 252 handelsdagen",volatility30d:"Volatiliteit · 30 dagen",return_12m:"Rendement · 12 maanden",rsi14_simple:"RSI · 14 dagen (0–100)",beta_vs_sp500:"Bèta ten opzichte van S&P 500",sma20:"Gemiddelde koers · 20 dagen",sma20_distance:"Afstand tot 20-daags gemiddelde",
 fed_funds_target_lower:"Fed beleidsrente · ondergrens",fed_funds_target_upper:"Fed beleidsrente · bovengrens",cpi_inflation_yoy:"Inflatie VS · jaar op jaar",
 treasury_10y_yield:"Amerikaanse rente · 10 jaar",treasury_13w_yield:"Amerikaanse rente · 13 weken",fed_funds_lower:"Fed beleidsrente · ondergrens",fed_funds_upper:"Fed beleidsrente · bovengrens",vix:"VIX-index",dollar_index:"Dollarindex",sp500:"S&P 500-index",sma_50_distance_pct:"Afstand tot 50-daags gemiddelde",sma_200_distance_pct:"Afstand tot 200-daags gemiddelde",
 trailing_pe:"K/W afgelopen jaar",forward_pe:"K/W verwacht",ev_ebitda:"EV / EBITDA",price_to_sales:"Koers / omzet",price_to_fcf:"Koers / vrije kasstroom",
 free_cash_flow_yield:"Vrije kasstroomrendement",fcf_yield:"Vrije kasstroomrendement",roe:"Rendement eigen vermogen",operating_margin:"Operationele marge",revenue_growth:"Omzetgroei",
 total_debt:"Totale schuld",cash:"Kaspositie",net_debt:"Nettoschuld",free_cash_flow:"Vrije kasstroom",market_cap:"Marktwaarde",enterprise_value:"Ondernemingswaarde",
 annualized_volatility_252d:"Volatiliteit · 252 handelsdagen",volatility_252d:"Volatiliteit · 252 handelsdagen",volatility_30d:"Volatiliteit · 30 dagen",
 max_drawdown_1y:"Grootste daling · 1 jaar",return_1m:"Rendement · 1 maand",return_3m:"Rendement · 3 maanden",return_6m:"Rendement · 6 maanden",return_1y:"Rendement · 1 jaar",
 sma50:"Gemiddelde koers · 50 dagen",sma200:"Gemiddelde koers · 200 dagen",sma50_distance:"Afstand tot 50-daags gemiddelde",sma200_distance:"Afstand tot 200-daags gemiddelde",
 distance_sma50:"Afstand tot 50-daags gemiddelde",distance_sma200:"Afstand tot 200-daags gemiddelde",rsi14:"RSI · 14 dagen (0–100)",beta:"Bèta",
 treasury_yield_10y_pct:"Amerikaanse rente · 10 jaar",fed_funds_rate_pct:"Fed beleidsrente",vix_index:"VIX-index",price:"Laatste koers",
};
