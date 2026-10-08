"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { plainStatus, runtimeExplanation } from "@/lib/os/presentation";
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

function checkName(check: Check) {
  const names: Record<string, string> = { "os-auth": "Beveiligde toegang", "execution-lock": "Stabiele versie beschermd", "browser-execution-lock": "Geen handel via de browser", "runtime-state-feed": "Actuele onderzoeksgegevens", "runtime-scheduler": "Onderzoek automatisch gepland", "runtime-provider": "Modelbeschikbaarheid", "runtime-compute": "Modelverbruik en budget" };
  if (names[check.id]) return names[check.id];
  const environment = check.group === "production" ? "Stabiele omgeving" : check.group === "research" ? "Onderzoek" : check.group === "builder" ? "Ontwikkeling" : "Systeem";
  return environment + (check.id.endsWith("-config") ? " · instellingen" : check.id.endsWith("-health") ? " · verbinding" : check.id.endsWith("-sessions") ? " · opgeslagen gesprekken" : check.id.endsWith("-capabilities") ? " · vaardigheden" : " · controle");
}
function checkExplanation(check: Check) {
  if (check.state === "not_configured") return "Deze koppeling is nog niet ingesteld.";
  if (check.state === "fail") return "Deze controle is niet geslaagd. Bekijk de volledige systeemtoelichting voor de oorzaak.";
  if (check.state === "warning") return "Deze controle vraagt aandacht. De volledige systeemtoelichting bevat de gemelde beperking.";
  const messages: Record<string, string> = { "os-auth": "De toegang is beveiligd.", "execution-lock": "Onderzoeksopdrachten kunnen de stabiele versie niet wijzigen.", "browser-execution-lock": "Dit scherm kan geen handel met echt geld activeren.", "runtime-state-feed": "De actuele onderzoeksstatus kan worden opgehaald.", "runtime-scheduler": "De automatische onderzoeksplanning is actief.", "runtime-provider": "De modelcontrole meldt geen blokkade.", "runtime-compute": "Het ingestelde budget en verbruik zijn beschikbaar." };
  return messages[check.id] || "Deze controle is geslaagd.";
}

  function CheckRows({ checks }: { checks: Check[] }) {
    if (!checks.length) return <div>Geen checks in deze groep.</div>;
    return <div className={styles.checkList}>{[...checks].sort((a, b) => Number(a.state === "pass") - Number(b.state === "pass")).map((check) => <article key={check.id} className={styles.checkRow}>
      <div className={`${styles.stateIcon} ${styles[`state_${check.state}`]}`}>{check.state === "pass" ? "✓" : check.state === "warning" ? "!" : "×"}</div>
      <div className={styles.checkBody}><strong>{checkName(check)}</strong><p>{checkExplanation(check)}</p>{(check.httpStatus || check.latencyMs !== undefined) && <small>{check.httpStatus ? `HTTP ${check.httpStatus}` : ""}{check.httpStatus && check.latencyMs !== undefined ? " · " : ""}{check.latencyMs !== undefined ? `${check.latencyMs} ms` : ""}</small>}</div>
      <span className={`${styles.pill} ${styles[`pill_${check.state}`]}`}>{stateLabel(check.state)}</span>
    </article>)}</div>;
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
      setData(null);
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

  const tone = statusTone(data);
  const status = !data ? "Systeemstatus laden…" : data.summary.failedRequired ? `${data.summary.failedRequired} kritieke fout(en)` : data.summary.warnings ? `${data.summary.warnings} waarschuwing(en)` : "Systeem gezond";

  return <HermesShell active="instellingen" status={status} statusTone={tone} wide actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Controleren…" : "Controleer opnieuw"}</button>}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>Systeemgezondheid</span><h1>Werkt alles zoals verwacht?</h1><p>Bekijk welke verbindingen en controles werken en waar aandacht nodig is. Opnieuw controleren leest alleen de status.</p></div>
      <div className={`${styles.summary} ${data?.summary.ready ? styles.ready : styles.warning}`}><span>Verplichte controles</span><strong>{data ? `${data.summary.passedRequired}/${data.summary.requiredTotal}` : "—"}</strong><p>{!data ? "status nog niet bevestigd" : data.summary.ready ? "alle verplichte controles zijn geslaagd" : "er zijn blokkades die aandacht vragen"}</p></div>
    </section>

    {error && <div className={styles.error}><strong>Diagnostiek kon niet worden geladen</strong><span>{error}</span></div>}

    <details className={styles.panel}><summary>Versie en technische omgeving</summary><section className={styles.releaseStrip}>
      <div><span>OS-versie</span><strong>v{data?.deployment.version || "—"}</strong><small>{data?.deployment.release || "—"}</small></div>
      <div><span>Git-commit</span><code>{data?.deployment.shortCommit || "—"}</code><small>{data?.deployment.branch || "—"}</small></div>
      <div><span>Runtime</span><strong>{plainStatus(data?.runtime?.state)}</strong><small>{runtimeExplanation(data?.runtime?.state)}</small></div>
      <div><span>Laatste check</span><strong>{data ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt)) : "—"}</strong><small>Controle door de server</small></div>
    </section>

    </details>
    <section className={styles.grid}>
      <section className={styles.panel}><header><div><span>Beveiliging</span><h2>OS en beveiliging</h2></div><small>toegang en veiligheid</small></header><CheckRows checks={groups.os} /></section>
      <section className={styles.panel}><header><div><span>Onderzoeksstatus</span><h2>Automatisering en capaciteit</h2></div><small>actuele status</small></header><CheckRows checks={groups.runtime} /></section>
      <section className={styles.panel}><header><div><span>Stabiele omgeving</span><h2>Stabiele omgeving</h2></div><small>alleen bekijken</small></header><CheckRows checks={groups.production} /></section>
      <section className={styles.panel}><header><div><span>Onderzoek</span><h2>Onderzoeksomgeving</h2></div><small>onder gecontroleerde grenzen</small></header><CheckRows checks={groups.research} /></section>
      <section className={styles.panel}><header><div><span>Ontwikkeling</span><h2>Ontwikkelomgeving</h2></div><small>wijzigingen geblokkeerd</small></header><CheckRows checks={groups.builder} /></section>
    </section>

    <p><Link href="/analyses#systeem">Lees de volledige systeemcontroles →</Link></p>
    <footer className={styles.footer}><span>Diagnostiek leest status; het start geen onderzoek en voert geen transactie uit.</span><Link href="/instellingen">← Terug naar instellingen</Link></footer>
  </HermesShell>;
}
