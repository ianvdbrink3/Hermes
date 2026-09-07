"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HermesShell, type HermesTone } from "./hermes-shell";
import styles from "./system-health.module.css";

type CheckState = "pass" | "fail" | "warning" | "not_configured";
type CheckGroup = "os" | "runtime" | "production" | "research" | "builder";
type Check = {
  id: string;
  label: string;
  group: CheckGroup;
  state: CheckState;
  required: boolean;
  message: string;
  httpStatus?: number;
  latencyMs?: number;
};
type Diagnostics = {
  generatedAt: string;
  deployment: {
    version: string;
    release: string;
    commit: string;
    shortCommit: string;
    branch: string;
    environment: string;
    url: string | null;
  };
  runtime?: {
    state?: string;
    reason?: string | null;
    fixture?: string | null;
    provider?: { state?: string; retryNotBeforeUtc?: string | null };
  };
  summary: {
    ready: boolean;
    passedRequired: number;
    requiredTotal: number;
    failedRequired: number;
    warnings: number;
  };
  checks: Check[];
};

function stateLabel(state: CheckState) {
  if (state === "pass") return "Gereed";
  if (state === "warning") return "Controleren";
  if (state === "not_configured") return "Niet ingesteld";
  return "Mislukt";
}

function statusTone(data: Diagnostics | null): HermesTone {
  if (!data) return "muted";
  if (data.summary.failedRequired > 0) return "bad";
  if (data.summary.warnings > 0) return "warn";
  return "good";
}

export function HermesSystemReadiness() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/brain/diagnostics", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Diagnostics gaf HTTP ${response.status}`);
      setData(payload as Diagnostics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Systeemdiagnostiek kon niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const groups = useMemo(() => {
    const checks = data?.checks || [];
    return {
      os: checks.filter((check) => check.group === "os"),
      runtime: checks.filter((check) => check.group === "runtime"),
      production: checks.filter((check) => check.group === "production"),
      research: checks.filter((check) => check.group === "research"),
      builder: checks.filter((check) => check.group === "builder"),
    };
  }, [data]);

  function CheckRows({ checks }: { checks: Check[] }) {
    if (!checks.length) return <div>Geen checks in deze groep.</div>;
    return <div className={styles.checkList}>{checks.map((check) => <article key={check.id} className={styles.checkRow}>
      <div className={`${styles.stateIcon} ${styles[`state_${check.state}`]}`}>{check.state === "pass" ? "✓" : check.state === "warning" ? "!" : "×"}</div>
      <div className={styles.checkBody}><strong>{check.label}</strong><p>{check.message}</p>{(check.httpStatus || check.latencyMs !== undefined) && <small>{check.httpStatus ? `HTTP ${check.httpStatus}` : ""}{check.httpStatus && check.latencyMs !== undefined ? " · " : ""}{check.latencyMs !== undefined ? `${check.latencyMs} ms` : ""}</small>}</div>
      <span className={`${styles.pill} ${styles[`pill_${check.state}`]}`}>{stateLabel(check.state)}</span>
    </article>)}</div>;
  }

  const tone = statusTone(data);
  const status = !data ? "Systeemstatus laden…" : data.summary.failedRequired ? `${data.summary.failedRequired} kritieke fout(en)` : data.summary.warnings ? `${data.summary.warnings} waarschuwing(en)` : "Systeem gezond";

  return <HermesShell active="instellingen" status={status} statusTone={tone} wide actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Controleren…" : "Controleer opnieuw"}</button>}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>Systeemgezondheid</span><h1>Zie permanent of Hermes betrouwbaar kan draaien.</h1><p>Geen eenmalige VPS-cutovercheck meer. Deze pagina controleert de OS-beveiliging, actuele runtime, Production, Research en Builder zonder zelf modelruns of mutaties te starten.</p></div>
      <div className={`${styles.summary} ${data?.summary.ready ? styles.ready : styles.warning}`}><span>Verplichte checks</span><strong>{data ? `${data.summary.passedRequired}/${data.summary.requiredTotal}` : "—"}</strong><p>{data?.summary.ready ? "alle verplichte checks zijn groen" : "er zijn blokkades die aandacht vragen"}</p></div>
    </section>

    {error && <div className={styles.error}><strong>Diagnostiek kon niet worden geladen</strong><span>{error}</span></div>}

    <section className={styles.releaseStrip}>
      <div><span>OS-versie</span><strong>v{data?.deployment.version || "—"}</strong><small>{data?.deployment.release || "—"}</small></div>
      <div><span>Git-commit</span><code>{data?.deployment.shortCommit || "—"}</code><small>{data?.deployment.branch || "—"}</small></div>
      <div><span>Runtime</span><strong>{data?.runtime?.state || "—"}</strong><small>{data?.runtime?.fixture || data?.runtime?.reason || "—"}</small></div>
      <div><span>Laatste check</span><strong>{data ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt)) : "—"}</strong><small>server-side diagnostiek</small></div>
    </section>

    <section className={styles.grid}>
      <section className={styles.panel}><header><div><span>Control plane</span><h2>OS & beveiliging</h2></div><small>browsergrenzen</small></header><CheckRows checks={groups.os} /></section>
      <section className={styles.panel}><header><div><span>Research runtime</span><h2>Scheduler, state & compute</h2></div><small>autoritatieve flow</small></header><CheckRows checks={groups.runtime} /></section>
      <section className={styles.panel}><header><div><span>Approved brain</span><h2>Production</h2></div><small>inspect-only</small></header><CheckRows checks={groups.production} /></section>
      <section className={styles.panel}><header><div><span>Research workspace</span><h2>Research</h2></div><small>interactief, policy-gated</small></header><CheckRows checks={groups.research} /></section>
      <section className={styles.panel}><header><div><span>Capability work</span><h2>Builder</h2></div><small>mutation nog geblokkeerd</small></header><CheckRows checks={groups.builder} /></section>
    </section>

    <footer className={styles.footer}><span>Diagnostiek leest status; het start geen Hermes-run en activeert geen execution.</span><Link href="/instellingen">← Terug naar instellingen</Link></footer>
  </HermesShell>;
}
