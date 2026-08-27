"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./autonomy-dashboard.module.css";

type RecordLike = Record<string, unknown>;

type AutonomyResponse = {
  connected?: boolean;
  state?: string;
  message?: string;
  snapshot?: RecordLike;
  heartbeat?: {
    state?: string;
    message?: string;
    heartbeat?: {
      id?: string;
      name?: string;
      active?: boolean;
      schedule?: unknown;
      nextRun?: unknown;
      lastRun?: unknown;
      lastStatus?: unknown;
    } | null;
  };
};

type BrainStatusResponse = {
  production?: { state?: string; profile?: string; message?: string };
  research?: { state?: string; profile?: string; message?: string };
  builder?: { state?: string; profile?: string; message?: string };
};

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function asArray(value: unknown): RecordLike[] {
  return Array.isArray(value) ? value.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function humanValue(value: unknown) {
  const valueText = text(value, "None").trim();
  return valueText || "None";
}

function isNone(value: unknown) {
  const normalized = humanValue(value).toLowerCase();
  return ["none", "—", "-", "n/a", "null", "nothing", "geen", "no blockers"].includes(normalized);
}

function stateClass(state?: string) {
  if (state === "connected") return styles.good;
  if (state === "degraded" || state === "not_configured") return styles.warn;
  return styles.bad;
}

function verdictClass(value: unknown) {
  const verdict = text(value, "").toUpperCase();
  if (verdict === "PASS" || verdict === "COMPLETE" || verdict === "ACCEPT") return styles.pass;
  if (verdict === "REJECT" || verdict === "FAILED" || verdict === "BLOCKED_NEEDS_HUMAN") return styles.reject;
  return styles.inconclusive;
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export function AutonomyDashboard() {
  const [autonomy, setAutonomy] = useState<AutonomyResponse | null>(null);
  const [brain, setBrain] = useState<BrainStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [autonomyResponse, brainResponse] = await Promise.all([
        fetch("/api/brain/autonomy", { cache: "no-store" }),
        fetch("/api/brain/status", { cache: "no-store" }),
      ]);
      const autonomyPayload = (await autonomyResponse.json()) as AutonomyResponse;
      const brainPayload = (await brainResponse.json()) as BrainStatusResponse;
      setAutonomy(autonomyPayload);
      setBrain(brainPayload);
      setLastRefresh(new Date());
    } catch (error) {
      setAutonomy({ connected: false, state: "offline", message: error instanceof Error ? error.message : "Unable to refresh." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const snapshot = asRecord(autonomy?.snapshot);
  const current = asRecord(snapshot.current);
  const backlog = asRecord(snapshot.backlog);
  const experiments = asRecord(snapshot.experiments);
  const git = asRecord(snapshot.git);
  const quality = asRecord(snapshot.quality);
  const backlogEntries = asArray(backlog.entries);
  const recentExperiments = asArray(experiments.recent || experiments.entries).slice(0, 6);
  const recentDecisions = asArray(snapshot.decisions).slice(0, 5);
  const evidence = Array.isArray(current.important_evidence) ? current.important_evidence.map((item) => String(item)) : [];

  const needsHuman = current.needs_human;
  const blocked = !isNone(needsHuman);
  const heartbeat = autonomy?.heartbeat?.heartbeat;
  const heartbeatActive = Boolean(heartbeat?.active);
  const labState = blocked ? "NEEDS YOU" : heartbeatActive ? "AUTONOMOUS" : autonomy?.connected ? "READY" : "OFFLINE";

  const stats = useMemo(() => {
    const counts = asRecord(backlog.counts);
    const expCounts = asRecord(experiments.counts);
    return {
      pending: Number(counts.pending || counts.PENDING || 0),
      complete: Number(counts.complete || counts.COMPLETE || 0),
      blocked: Number(counts.blocked || counts.BLOCKED_NEEDS_HUMAN || 0),
      pass: Number(expCounts.pass || expCounts.PASS || 0),
      reject: Number(expCounts.reject || expCounts.REJECT || 0),
      inconclusive: Number(expCounts.inconclusive || expCounts.INCONCLUSIVE || 0),
    };
  }, [backlog, experiments]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <div className={styles.kicker}>HERMES INVESTMENT OS · AUTONOMY CONTROL CENTER</div>
          <h1>Autonomous Investment Lab</h1>
        </div>
        <div className={styles.topActions}>
          <Link href="/brain" className={styles.linkButton}>Hermes Control</Link>
          <Link href="/brain/system" className={styles.linkButton}>System</Link>
          <button type="button" onClick={() => void refresh()} className={styles.refreshButton} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <section className={styles.content}>
        <div className={`${styles.hero} ${blocked ? styles.heroBlocked : ""}`}>
          <div className={styles.heroStatus}>
            <span className={`${styles.pulse} ${blocked ? styles.pulseBad : autonomy?.connected ? styles.pulseGood : styles.pulseMuted}`} />
            <strong>{labState}</strong>
            <span>{heartbeatActive ? "hourly heartbeat enabled" : "heartbeat unavailable"}</span>
          </div>
          <h2>{text(current.current_objective, autonomy?.connected ? "Waiting for first autonomy snapshot" : "Autonomy state feed is not connected")}</h2>
          <p className={styles.heroDescription}>
            Hermes chooses its own next safe research action, executes bounded work, records evidence, and hands you only genuine human gates.
          </p>
          <div className={styles.heroMeta}>
            <div><span>Next heartbeat</span><strong>{formatTime(heartbeat?.nextRun)}</strong></div>
            <div><span>Last completed</span><strong>{text(current.last_completed_work, "—")}</strong></div>
            <div><span>Last refresh</span><strong>{lastRefresh ? formatTime(lastRefresh.toISOString()) : "—"}</strong></div>
          </div>
        </div>

        {!autonomy?.connected ? (
          <div className={styles.notice}>
            <strong>Autonomy state feed unavailable.</strong>
            <span>{autonomy?.message || "The dashboard will populate after the read-only VPS state endpoint is enabled."}</span>
          </div>
        ) : null}

        <div className={styles.metricGrid}>
          <Metric label="Backlog pending" value={stats.pending} />
          <Metric label="Completed" value={stats.complete} />
          <Metric label="Experiments PASS" value={stats.pass} />
          <Metric label="Experiments REJECT" value={stats.reject} />
          <Metric label="Inconclusive" value={stats.inconclusive} />
          <Metric label="Human gates" value={blocked ? 1 : 0} note={blocked ? "attention required" : "none"} />
        </div>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHeader}>
              <div><span>LIVE STATE</span><h3>What Hermes is doing</h3></div>
              <span className={styles.badge}>{text(snapshot.mode, labState)}</span>
            </div>
            <div className={styles.stateRows}>
              <div><span>IN PROGRESS</span><p>{humanValue(current.in_progress)}</p></div>
              <div><span>NEXT</span><p>{humanValue(current.next)}</p></div>
              <div><span>BLOCKERS</span><p>{humanValue(current.blockers)}</p></div>
            </div>
          </section>

          <section className={`${styles.card} ${blocked ? styles.needsHumanCard : ""}`}>
            <div className={styles.cardHeader}>
              <div><span>NEEDS YOU</span><h3>{blocked ? "Human decision required" : "Nothing required"}</h3></div>
              <span className={`${styles.badge} ${blocked ? styles.badgeDanger : styles.badgeGood}`}>{blocked ? "ACTION" : "CLEAR"}</span>
            </div>
            <p className={styles.longText}>{humanValue(needsHuman)}</p>
            <div className={styles.guardrail}>Hermes should only stop here for credentials, external permissions, production promotion, broker binding, real financial actions, or another irreversible gate.</div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><span>PROFILES</span><h3>Brain connectivity</h3></div>
            </div>
            <div className={styles.profileRows}>
              {(["production", "research", "builder"] as const).map((key) => {
                const item = brain?.[key];
                return (
                  <div key={key}>
                    <span className={`${styles.profileDot} ${stateClass(item?.state)}`} />
                    <div><strong>{item?.profile || `his-${key}`}</strong><small>{item?.state || "unknown"}</small></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><span>QUALITY GATES</span><h3>Current verification</h3></div>
            </div>
            <div className={styles.qualityGrid}>
              <Metric label="Pytest passed" value={text(quality.pytest_passed, "—")} />
              <Metric label="Pytest failed" value={text(quality.pytest_failed, "—")} />
              <Metric label="Ruff" value={text(quality.ruff, "—")} />
              <Metric label="Mypy" value={text(quality.mypy, "—")} />
            </div>
          </section>

          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHeader}>
              <div><span>AUTONOMOUS BACKLOG</span><h3>Highest-priority work</h3></div>
              <span className={styles.badge}>{backlogEntries.length} visible</span>
            </div>
            <div className={styles.table}>
              {backlogEntries.length ? backlogEntries.slice(0, 8).map((item, index) => (
                <div className={styles.tableRow} key={`${text(item.task_id)}-${index}`}>
                  <code>{text(item.task_id)}</code>
                  <strong>{text(item.priority, "—")}</strong>
                  <span className={`${styles.verdict} ${verdictClass(item.status)}`}>{text(item.status)}</span>
                  <p>{text(item.rationale)}</p>
                </div>
              )) : <div className={styles.empty}>No backlog snapshot yet.</div>}
            </div>
          </section>

          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHeader}>
              <div><span>EXPERIMENT LEDGER</span><h3>What Hermes learned</h3></div>
            </div>
            <div className={styles.timeline}>
              {recentExperiments.length ? recentExperiments.map((item, index) => (
                <article key={`${text(item.experiment_id)}-${index}`}>
                  <div className={styles.timelineTop}>
                    <code>{text(item.experiment_id)}</code>
                    <span className={`${styles.verdict} ${verdictClass(item.verdict)}`}>{text(item.verdict)}</span>
                  </div>
                  <h4>{text(item.hypothesis, "Experiment")}</h4>
                  <p>{text(item.result, "No result summary recorded.")}</p>
                  <small>{formatTime(item.timestamp)}</small>
                </article>
              )) : <div className={styles.empty}>No experiment history available yet.</div>}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><span>GIT CHECKPOINT</span><h3>Repository state</h3></div>
            </div>
            <dl className={styles.definitionList}>
              <div><dt>Branch</dt><dd>{text(git.branch)}</dd></div>
              <div><dt>HEAD</dt><dd><code>{text(git.head_short || git.head)}</code></dd></div>
              <div><dt>Tree</dt><dd><code>{text(git.tree_short || git.tree)}</code></dd></div>
              <div><dt>Working tree</dt><dd className={Boolean(git.dirty) ? styles.textWarn : styles.textGood}>{Boolean(git.dirty) ? "DIRTY" : "CLEAN"}</dd></div>
            </dl>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div><span>SAFETY</span><h3>Production boundary</h3></div>
              <span className={`${styles.badge} ${styles.badgeDanger}`}>LOCKED</span>
            </div>
            <div className={styles.lockList}>
              <span>Live orders disabled</span>
              <span>Broker binding requires human approval</span>
              <span>Risk limits cannot be weakened autonomously</span>
              <span>Production promotion remains gated</span>
            </div>
          </section>

          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHeader}>
              <div><span>IMPORTANT EVIDENCE</span><h3>Why the current state is trustworthy</h3></div>
            </div>
            <ul className={styles.evidenceList}>
              {evidence.length ? evidence.slice(0, 10).map((item, index) => <li key={`${item}-${index}`}>{item}</li>) : <li>No evidence snapshot available yet.</li>}
            </ul>
          </section>

          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHeader}>
              <div><span>DECISION LOG</span><h3>Recent autonomous decisions</h3></div>
            </div>
            <div className={styles.decisionList}>
              {recentDecisions.length ? recentDecisions.map((item, index) => (
                <div key={`${text(item.decision_id)}-${index}`}>
                  <code>{text(item.decision_id)}</code>
                  <p>{text(item.decision)}</p>
                  <small>{formatTime(item.timestamp)}</small>
                </div>
              )) : <div className={styles.empty}>No decision history available yet.</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
