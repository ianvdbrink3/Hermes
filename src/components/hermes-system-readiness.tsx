"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./hermes-system-readiness.module.css";

type CheckState = "pass" | "fail" | "warning" | "not_configured" | "untested";
type Check = {
  id: string;
  label: string;
  group: "os" | "production" | "research" | "builder" | "manual";
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
  summary: {
    automaticReady: boolean;
    passedRequired: number;
    requiredTotal: number;
    failedRequired: number;
    manualRemaining: number;
  };
  checks: Check[];
};

const manualKey = "hermes-system-readiness-manual-v1";

const cutover = [
  { phase: "1", title: "Oracle host", items: ["SSH into the new server", "Verify OS, architecture and memory", "Add swap if the instance is memory constrained", "Confirm outbound internet and only intended inbound ports"] },
  { phase: "2", title: "Preserve existing Hermes", items: ["Inventory the existing Mac his-production profile", "Identify sessions, memory, skills, config and investment project files", "Create a backup before changing anything", "Do not replace the existing Hermes brain with an empty install"] },
  { phase: "3", title: "Hermes on VPS", items: ["Install Hermes cleanly on the VPS", "Restore/selectively migrate existing investment state", "Start his-production", "Create and start isolated his-research", "Generate separate API credentials"] },
  { phase: "4", title: "Secure origin", items: ["Keep Hermes API bound behind a secure HTTPS origin", "Do not expose the Hermes bearer token over plaintext HTTP", "Verify /health externally", "Keep broker execution ports and services closed"] },
  { phase: "5", title: "Vercel cutover", items: ["Update production Hermes origin and key", "Configure the separate Research route and key", "Redeploy the correct hermestradingos project", "Confirm the OS version/commit shown here matches the intended release"] },
  { phase: "6", title: "Hermes Control verification", items: ["Run System Readiness again", "Open existing Production history", "Send one Research message and observe streaming", "Reload and confirm the conversation persists", "Refresh Current Plan", "Inspect one real artifact or backtest reference"] },
  { phase: "7", title: "Final continuity", items: ["Stop the old Mac-hosted Hermes gateway", "Refresh Hermes Control", "Send another Research message", "Confirm Production history still loads", "Only then consider the VPS cutover complete"] },
];

function stateLabel(state: CheckState) {
  if (state === "pass") return "Ready";
  if (state === "not_configured") return "Not configured";
  if (state === "untested") return "Manual check";
  if (state === "warning") return "Review";
  return "Failed";
}

export function HermesSystemReadiness() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manual, setManual] = useState<Record<string, boolean>>({});

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/brain/diagnostics", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Diagnostics returned HTTP ${response.status}`);
      setData(payload as Diagnostics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "System diagnostics could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    try {
      const stored = window.localStorage.getItem(manualKey);
      if (stored) setManual(JSON.parse(stored) as Record<string, boolean>);
    } catch { /* optional local state */ }
  }, []);

  function toggleManual(id: string) {
    setManual((current) => {
      const next = { ...current, [id]: !current[id] };
      try { window.localStorage.setItem(manualKey, JSON.stringify(next)); } catch { /* optional local state */ }
      return next;
    });
  }

  const groups = useMemo(() => {
    const checks = data?.checks || [];
    return {
      os: checks.filter((check) => check.group === "os"),
      production: checks.filter((check) => check.group === "production"),
      research: checks.filter((check) => check.group === "research"),
      builder: checks.filter((check) => check.group === "builder"),
      manual: checks.filter((check) => check.group === "manual"),
    };
  }, [data]);

  const manualComplete = groups.manual.filter((check) => manual[check.id]).length;
  const overallReady = Boolean(data?.summary.automaticReady && groups.manual.length > 0 && manualComplete === groups.manual.length);

  function CheckRows({ checks }: { checks: Check[] }) {
    if (!checks.length) return <div className={styles.empty}>No checks in this group.</div>;
    return <div className={styles.checkList}>{checks.map((check) => <article key={check.id} className={styles.checkRow}>
      <div className={`${styles.stateIcon} ${styles[`state_${check.state}`]}`}>{check.state === "pass" ? "✓" : check.state === "untested" ? "·" : check.state === "warning" ? "!" : "×"}</div>
      <div className={styles.checkBody}><div><strong>{check.label}</strong>{check.required && <span>Required</span>}</div><p>{check.message}</p>{(check.httpStatus || check.latencyMs !== undefined) && <small>{check.httpStatus ? `HTTP ${check.httpStatus}` : ""}{check.httpStatus && check.latencyMs !== undefined ? " · " : ""}{check.latencyMs !== undefined ? `${check.latencyMs} ms` : ""}</small>}</div>
      <span className={`${styles.statePill} ${styles[`pill_${check.state}`]}`}>{stateLabel(check.state)}</span>
    </article>)}</div>;
  }

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.brand}><Link href="/brain"><b>H</b><span><strong>Hermes</strong><small>Investment OS</small></span></Link><i /><div><span>System</span><strong>Readiness</strong></div></div>
      <nav><Link href="/brain">Hermes Control</Link><Link href="/brain/lab">Brain Lab</Link></nav>
    </header>

    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}><span className={styles.eyebrow}>Activation Center</span><h1>Know exactly what is ready before cutover.</h1><p>This page checks the OS, Production and Research connections without changing Hermes. The final interactive checks stay manual so diagnostics never create sessions or run research behind your back.</p></div>
        <div className={`${styles.readinessCard} ${overallReady ? styles.ready : ""}`}>
          <span>{overallReady ? "Cutover verified" : data?.summary.automaticReady ? "Automatic checks ready" : "Setup incomplete"}</span>
          <strong>{data ? `${data.summary.passedRequired}/${data.summary.requiredTotal}` : "—"}</strong>
          <p>automatic required checks passing</p>
          <button onClick={() => void refresh()} disabled={loading}>{loading ? "Checking…" : "Run diagnostics"}</button>
        </div>
      </section>

      {error && <div className={styles.error}><strong>Diagnostics could not be loaded</strong><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}

      <section className={styles.releaseStrip}>
        <div><span>OS version</span><strong>v{data?.deployment.version || "0.3.4"}</strong><small>{data?.deployment.release || "System Readiness"}</small></div>
        <div><span>Git commit</span><code>{data?.deployment.shortCommit || "checking"}</code><small>{data?.deployment.branch || "—"}</small></div>
        <div><span>Deployment</span><strong>{data?.deployment.environment || "—"}</strong><small>{data?.deployment.url || "Deployment URL not reported"}</small></div>
        <div><span>Last checked</span><strong>{data ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.generatedAt)) : "—"}</strong><small>live server-side diagnostics</small></div>
      </section>

      <section className={styles.grid}>
        <div className={styles.column}>
          <section className={styles.panel}><header><div><span>Control plane</span><h2>OS safety</h2></div></header><CheckRows checks={groups.os} /></section>
          <section className={styles.panel}><header><div><span>Approved brain</span><h2>Production</h2></div><small>Inspect only</small></header><CheckRows checks={groups.production} /></section>
        </div>
        <div className={styles.column}>
          <section className={styles.panel}><header><div><span>Interactive workspace</span><h2>Research</h2></div><small>Required for live Control</small></header><CheckRows checks={groups.research} /></section>
          <section className={styles.panel}><header><div><span>Future capability work</span><h2>Builder</h2></div><small>Optional tonight</small></header><CheckRows checks={groups.builder} /></section>
        </div>
      </section>

      <section className={styles.manualPanel}>
        <header><div><span>Final validation</span><h2>Checks that require a real Hermes interaction</h2><p>Mark these only after you actually perform them. They are stored locally in this browser and do not alter Hermes.</p></div><strong>{manualComplete}/{groups.manual.length}</strong></header>
        <div className={styles.manualList}>{groups.manual.map((check) => <button key={check.id} className={manual[check.id] ? styles.manualDone : ""} onClick={() => toggleManual(check.id)}><i>{manual[check.id] ? "✓" : ""}</i><span><strong>{check.label}</strong><small>{check.message}</small></span></button>)}</div>
        <div className={styles.manualActions}><Link href="/brain">Open Hermes Control</Link><button onClick={() => { setManual({}); try { window.localStorage.removeItem(manualKey); } catch { /* optional */ } }}>Reset manual checks</button></div>
      </section>

      <section className={styles.runbook}>
        <header><span>Tonight</span><h2>Cutover runbook</h2><p>We will do this in order. Existing Hermes state is preserved before the VPS becomes authoritative.</p></header>
        <div className={styles.phases}>{cutover.map((phase) => <article key={phase.phase}><div className={styles.phaseNumber}>{phase.phase}</div><div><h3>{phase.title}</h3>{phase.items.map((item) => <p key={item}><i />{item}</p>)}</div></article>)}</div>
      </section>

      <footer className={styles.footer}><span>Diagnostics expose status only — never Hermes API keys, passwords or session secrets.</span><Link href="/brain">← Back to Hermes Control</Link></footer>
    </main>
  </div>;
}
