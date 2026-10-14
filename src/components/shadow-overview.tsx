"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ShadowSnapshot } from "@/lib/os/g11-shadow";
import { parseG11Snapshot } from "@/lib/os/g11-shadow";
import { liteStatus, type LiteSnapshot } from "@/lib/os/g11-lite";
import { decisionStory, finiteNumber } from "@/lib/os/presentation";
import { shadowOverviewStatus } from "@/lib/os/g11-shadow-status";
import styles from "./shadow-overview.module.css";

export function ShadowOverview() {
  const [snapshot, setData] = useState<ShadowSnapshot | LiteSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function read() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const response = await fetch("/api/os/g11-shadow", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const next = parseG11Snapshot(await response.json());
        if (!controller.signal.aborted) { setData(next); setFailed(false); }
      } catch { if (!controller.signal.aborted) { setData(null); setFailed(true); } }
      finally { running = false; }
    }
    void read();
    const timer = window.setInterval(() => void read(), 60_000);
    document.addEventListener("visibilitychange", read);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", read); };
  }, []);
  const data = snapshot?.schema_version === 1 ? snapshot : null;
  const portfolio = data?.latest.portfolio as Record<string, unknown> | undefined;
  const amount = finiteNumber(portfolio?.total_value);
  if (snapshot?.schema_version === 2) return <section className={styles.card}>
    <p role="status"><strong>{liteStatus(snapshot)}</strong></p>
    <div><span className={styles.label}>Marktonderzoek · Oefenobservaties</span>
    <h2>{snapshot.counts.tracked_stocks} aandelen gevolgd</h2>
    <p>{snapshot.counts.research_reports} gecombineerde analyses · {snapshot.counts.paper_days} echte observatiedagen.
    Maximaal één nieuw aandeelonderzoek per dag. Handel met echt geld staat uit.</p></div>
    <Link href="/trading">Bekijk aandelen en oefenportefeuille →</Link>
  </section>;
  return <section className={styles.card}>
    {data && <p role="status"><strong>{shadowOverviewStatus(data)}</strong> · Laatste besluit: {typeof data.latest.at === "string" && Number.isFinite(Date.parse(data.latest.at)) ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(data.latest.at)) : "Onbekend"}</p>}
    <div><span className={styles.label}>Marktonderzoek · Oefenobservaties</span><h2>{data ? decisionStory(data.latest.decision_action, data.latest.executed).title : failed ? "Observatiegegevens niet bereikbaar" : "Oefenobservaties laden…"}</h2><p>{data ? "Bekijk het laatste vastgelegde besluit, de risicocontrole en het oefenportefeuille." : "Zodra de gegevensverbinding beschikbaar is, zie je hier het laatste vastgelegde besluit."}</p></div>
    {data && <dl><div><dt>Oefenvermogen</dt><dd>{amount === null ? "Onbekend" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount)}</dd></div><div><dt>Observaties</dt><dd>{data.metrics.observations == null ? "Onbekend" : String(data.metrics.observations)} / 20</dd></div><div><dt>Handel met echt geld</dt><dd>Uitgeschakeld</dd></div></dl>}
    <Link href="/trading">Bekijk Trading →</Link>
  </section>;
}
