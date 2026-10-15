import React from "react";
import { formatResearchMetric, metricLabels, type OvernightResearch, type ResearchMetrics } from "../lib/os/overnight";
import styles from "./council-dashboard.module.css";
function Metrics({title,values,expected,currency}:{title:string;values:ResearchMetrics;expected:string[];currency:string}){
 const keys=[...new Set([...expected,...Object.keys(values)])];
 return <div><h4>{title}</h4><dl className={styles.metricGrid}>{keys.map(key=><div key={key}>
  <dt>{metricLabels[key] || key.replaceAll("_"," ")}</dt><dd>{formatResearchMetric(key,values[key],currency)}</dd>
 </div>)}</dl></div>;
}
export function TopOpportunities({data}:{data?:OvernightResearch|null}){
 return <section className={styles.panel} aria-label="Opgeslagen topkansen"><h2>Topkansen uit het nachtelijke onderzoek</h2>
 {!data ? <p>Er is nog geen opgeslagen nachtelijk onderzoek beschikbaar. De kansen en scores zijn onbekend.</p> : <>
 <p className={styles.muted}>Opgeslagen op {new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Amsterdam"}).format(new Date(data.generated_at))}.
  Dit is een onderzoeksranglijst; het CIO-besluit staat in het agentoverleg.</p>
 <div className={styles.stats}>
 <div><small>Geverifieerde noteringen</small><strong>{data.counts.verified_universe.toLocaleString("nl-NL")}</strong></div>
 <div><small>Met aanvullende gegevens</small><strong>{data.counts.enriched.toLocaleString("nl-NL")}</strong></div>
 <div><small>Volledige gegevens</small><strong>{data.counts.complete.toLocaleString("nl-NL")}</strong></div>
 </div>
 {data.morning_report ? <p>{data.morning_report}</p>:null}
 {!data.ranking.length ? <p>Er zijn geen onderbouwde kansen opgeslagen in deze onderzoeksronde.</p> :
 <ol className={styles.opportunities}>{data.ranking.map((row,i)=><li key={row.symbol+"-"+i}><details>
 <summary><strong>{row.symbol} · {row.name}</strong><span>Onderzoeksscore: {formatResearchMetric("score",row.score,row.currency)} · gegevens: {formatResearchMetric("completeness_pct",row.completeness_pct,row.currency)}</span></summary>
 <p>Waardering: {formatResearchMetric("score",row.valuation_score,row.currency)} · kwaliteit: {formatResearchMetric("score",row.quality_score,row.currency)} · momentum: {formatResearchMetric("score",row.momentum_score,row.currency)}. Bedragen in {row.currency}.</p>
 <Metrics title="Waardering en balans" values={row.financial} expected={["trailing_pe","forward_pe","ev_to_ebitda","free_cash_flow_yield","total_debt","cash_and_equivalents","net_debt","free_cash_flow","roe","operating_margin","revenue_growth"]} currency={row.currency}/>
 <Metrics title="Koers, momentum en risico" values={row.quant} expected={["annualized_volatility_252d","max_drawdown_1y","sma50","sma200","rsi14_simple","beta_vs_sp500"]} currency={row.currency}/>
 <Metrics title="Economische omgeving" values={row.macro} expected={["treasury_10y_yield","fed_funds_target_lower","fed_funds_target_upper","vix"]} currency={row.currency}/>
 {row.missing_fields.length ? <p className={styles.muted}>Ontbreekt: {row.missing_fields.map(key=>metricLabels[key] || key.replaceAll("_"," ")).join(", ")}.</p>:null}
 </details></li>)}</ol>}
 </>}
 </section>;
}
