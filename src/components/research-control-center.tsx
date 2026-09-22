"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeFixture,
  buildFixtureCards,
  latestPassedFixture,
  nextFixture,
  type FixtureReviewFeed,
} from "@/lib/os/fixture-review";
import { HermesShell, type HermesTone } from "./hermes-shell";
import styles from "./research-control-center.module.css";

type RecordLike = Record<string, unknown>;

type RuntimeState =
  | "READY"
  | "RUNNING"
  | "WAITING_PROVIDER"
  | "WAITING_PROVIDER_UNVERIFIED"
  | "WAITING_BUDGET"
  | "WAITING_SPACING"
  | "NEEDS_HUMAN"
  | "BLOCKED_UNVERIFIED_USAGE"
  | "BLOCKED_INTEGRITY"
  | "IDLE"
  | "DEGRADED"
  | "OFFLINE";

type Snapshot = {
  schemaVersion?: number;
  generatedAt?: string;
  runtime?: { state?: RuntimeState; reason?: string | null; readOnly?: boolean };
  mission?: {
    taskId?: string | null;
    fixture?: string | null;
    fixtureNumber?: number | null;
    nextFixture?: string | null;
    objective?: unknown;
    inProgress?: unknown;
    next?: unknown;
    blockers?: unknown;
    needsHuman?: unknown;
    lastCompletedWork?: unknown;
  };
  provider?: {
    name?: string;
    model?: string;
    state?: string;
    retryNotBeforeUtc?: string | null;
    cooldownActive?: boolean;
    historicalQuotaSignal?: boolean;
  };
  scheduler?: {
    found?: boolean;
    id?: string | null;
    name?: string | null;
    active?: boolean;
    schedule?: unknown;
    nextRun?: unknown;
    lastRun?: unknown;
    lastStatus?: unknown;
  };
  compute?: {
    available?: boolean;
    runs24h?: number | null;
    maxRuns24h?: number | null;
    promptTokens24h?: number | null;
    maxPromptTokens24h?: number | null;
    totalTokens24h?: number | null;
    maxTotalTokens24h?: number | null;
    openReservations?: number | null;
    voidedReservations?: number | null;
    estimatedContextBytes?: number | null;
    maxContextBytes?: number | null;
  };
  fixtureReview?: FixtureReviewFeed;
  lastReview?: RecordLike | null;
  events?: RecordLike[];
  safety?: RecordLike;
  connections?: {
    research?: { configured?: boolean; state?: string };
    production?: { configured?: boolean; state?: string };
    builder?: { configured?: boolean; state?: string };
  };
  telemetry?: {
    stateFeed?: boolean;
    scheduler?: boolean;
    compute?: boolean;
    exactProviderCooldown?: boolean;
    runtimeEvents?: boolean;
  };
  sourceSnapshot?: RecordLike;
};

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map(String).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compact(value: unknown, max = 210) {
  const source = text(value, "").replace(/\s+/g, " ").trim();
  if (!source) return "—";
  return source.length > max ? source.slice(0, max - 1) + "…" : source;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function number(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("nl-NL").format(value);
}

function ratio(value: number | null | undefined, max: number | null | undefined) {
  if (value === null || value === undefined || max === null || max === undefined) return "—";
  return number(value) + " / " + number(max);
}

function stateTone(state?: RuntimeState): HermesTone {
  if (state === "READY" || state === "RUNNING") return "good";
  if (["WAITING_PROVIDER", "WAITING_PROVIDER_UNVERIFIED", "WAITING_BUDGET", "WAITING_SPACING", "IDLE", "DEGRADED"].includes(state || "")) return "warn";
  if (["NEEDS_HUMAN", "BLOCKED_UNVERIFIED_USAGE", "BLOCKED_INTEGRITY", "OFFLINE"].includes(state || "")) return "bad";
  return "muted";
}

function stateLabel(state?: RuntimeState) {
  const labels: Partial<Record<RuntimeState, string>> = {
    READY: "Klaar",
    RUNNING: "Review actief",
    WAITING_PROVIDER: "Provider cooldown",
    WAITING_PROVIDER_UNVERIFIED: "Providerstatus onzeker",
    WAITING_BUDGET: "Compute-budget bereikt",
    WAITING_SPACING: "Wachtvenster actief",
    NEEDS_HUMAN: "Jouw actie nodig",
    BLOCKED_UNVERIFIED_USAGE: "Usage niet verifieerbaar",
    BLOCKED_INTEGRITY: "Integriteitsblokkade",
    IDLE: "Router idle",
    DEGRADED: "Beperkt beschikbaar",
    OFFLINE: "Runtime offline",
  };
  return state ? labels[state] || state : "Status laden…";
}

function eventTitle(item: RecordLike) {
  return compact(item.title || item.event || item.type || item.state || "Runtime-event", 120);
}

function eventBody(item: RecordLike) {
  return compact(item.message || item.reason || item.result || item.detail || item.status, 180);
}

export function ResearchControlCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      setSnapshot((await response.json()) as Snapshot);
      setLastRefresh(new Date());
    } catch {
      setSnapshot({ runtime: { state: "OFFLINE", reason: "De geconsolideerde OS-state kon niet worden geladen." } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const cards = useMemo(() => buildFixtureCards(snapshot || {}), [snapshot]);
  const current = useMemo(() => activeFixture(cards), [cards]);
  const next = useMemo(() => nextFixture(cards), [cards]);
  const lastPass = useMemo(() => latestPassedFixture(cards), [cards]);
  const passed = cards.filter((item) => item.status === "PASS").length;
  const decided = cards.filter((item) => ["PASS", "INCONCLUSIVE", "REJECT"].includes(item.status)).reverse().slice(0, 8);
  const events = (snapshot?.events || []).slice(0, 8);
  const compute = snapshot?.compute;
  const state = snapshot?.runtime?.state;
  const tone = stateTone(state);
  const status = stateLabel(state);
  const currentIdentity = current?.fixtureId || snapshot?.mission?.taskId || snapshot?.mission?.fixture || "Geen actieve review";

  const progress = cards.length ? Math.round((passed / cards.length) * 100) : 0;

  return (
    <HermesShell
      active="onderzoek"
      status={status}
      statusTone={tone}
      wide
      actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Laden…" : "Ververs"}</button>}
    >
      <section className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Research control</span>
          <div className={styles.stateLine}><i className={styles["tone_" + tone]} /><strong>{status}</strong></div>
          <h1>{currentIdentity}</h1>
          <p>{compact(snapshot?.mission?.objective || snapshot?.runtime?.reason, 300)}</p>
        </div>
        <div className={styles.headerMeta}>
          <span>Laatste refresh</span>
          <strong>{lastRefresh ? formatDate(lastRefresh.toISOString()) : "—"}</strong>
          <small>{snapshot?.runtime?.readOnly ? "Read-only control plane" : "Runtime state"}</small>
        </div>
      </section>

      <section className={styles.topGrid}>
        <article className={styles.currentCard}>
          <span>Current</span>
          <strong>{currentIdentity}</strong>
          <p>{compact(snapshot?.mission?.inProgress || snapshot?.runtime?.reason, 230)}</p>
          {current?.status ? <b>{current.label}</b> : null}
        </article>

        <article>
          <span>Next</span>
          <strong>{next?.fixtureId || compact(snapshot?.mission?.nextFixture || snapshot?.mission?.next, 70)}</strong>
          <p>{compact(snapshot?.mission?.next, 190)}</p>
        </article>

        <article>
          <span>Provider</span>
          <strong>{snapshot?.provider?.cooldownActive ? "Cooldown" : snapshot?.provider?.state || "Onbekend"}</strong>
          <p>{snapshot?.provider?.retryNotBeforeUtc ? "Retry na " + formatDate(snapshot.provider.retryNotBeforeUtc) : snapshot?.provider?.model || "Geen modelstatus"}</p>
        </article>

        <article>
          <span>Scheduler</span>
          <strong>{snapshot?.scheduler?.active ? "Actief" : "Niet actief"}</strong>
          <p>{snapshot?.scheduler?.nextRun ? "Volgende check " + formatDate(snapshot.scheduler.nextRun) : compact(snapshot?.scheduler?.lastStatus, 160)}</p>
        </article>
      </section>

      <section className={styles.progressPanel}>
        <div className={styles.progressHead}>
          <div>
            <span>Fixture chain</span>
            <h2>{passed}/{cards.length} bewezen PASS</h2>
          </div>
          <div className={styles.progressRight}>
            <strong>{progress}%</strong>
            <small>{lastPass ? "Laatste: " + lastPass.fixtureId : "Nog geen bewezen fixture-PASS"}</small>
          </div>
        </div>
        <div className={styles.progressTrack}><i style={{ width: progress + "%" }} /></div>
        <div className={styles.fixtureStrip}>
          {cards.map((item) => (
            <span
              key={item.fixtureId}
              title={item.fixtureId + " · " + item.label}
              className={
                item.status === "PASS"
                  ? styles.fixturePass
                  : item === current
                    ? styles.fixtureCurrent
                    : item.status === "REJECT"
                      ? styles.fixtureReject
                      : item.status === "INCONCLUSIVE" || item.status.startsWith("WAIT_")
                        ? styles.fixtureWait
                        : styles.fixturePending
              }
            >
              {item.number}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <header className={styles.panelHead}><div><span>Review history</span><h2>Recente bounded reviews</h2></div></header>
          <div className={styles.reviewList}>
            {decided.length ? decided.map((item) => (
              <article key={item.fixtureId + item.status}>
                <div>
                  <strong>{item.fixtureId}</strong>
                  <p>{item.semanticVerdict ? "Semantisch verdict: " + item.semanticVerdict : item.label}</p>
                </div>
                <span className={
                  item.status === "PASS"
                    ? styles.pass
                    : item.status === "REJECT"
                      ? styles.reject
                      : styles.wait
                }>{item.label}</span>
              </article>
            )) : <div className={styles.empty}>Nog geen geverifieerde fixture-reviewhistorie in de statefeed.</div>}
          </div>
        </div>

        <div className={styles.panel}>
          <header className={styles.panelHead}><div><span>Compute</span><h2>Budget & accounting</h2></div></header>
          <dl className={styles.metricRows}>
            <div><dt>Runs 24u</dt><dd>{compute?.available ? ratio(compute.runs24h, compute.maxRuns24h) : "—"}</dd></div>
            <div><dt>Prompttokens</dt><dd>{compute?.available ? ratio(compute.promptTokens24h, compute.maxPromptTokens24h) : "—"}</dd></div>
            <div><dt>Totaaltokens</dt><dd>{compute?.available ? ratio(compute.totalTokens24h, compute.maxTotalTokens24h) : "—"}</dd></div>
            <div><dt>Open reservations</dt><dd>{number(compute?.openReservations)}</dd></div>
            <div><dt>Voided</dt><dd>{number(compute?.voidedReservations)}</dd></div>
            <div><dt>Context</dt><dd>{compute?.estimatedContextBytes !== null && compute?.estimatedContextBytes !== undefined ? ratio(compute.estimatedContextBytes, compute.maxContextBytes) + " B" : "—"}</dd></div>
          </dl>
          {!snapshot?.telemetry?.compute ? <div className={styles.telemetryGap}>Compute-telemetrie is niet volledig bevestigd. Hermes vult ontbrekende waarden niet in.</div> : null}
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.panel}>
          <header className={styles.panelHead}><div><span>Mission</span><h2>Wat Hermes probeert af te ronden</h2></div></header>
          <dl className={styles.definitionRows}>
            <div><dt>Objective</dt><dd>{text(snapshot?.mission?.objective)}</dd></div>
            <div><dt>In progress</dt><dd>{text(snapshot?.mission?.inProgress)}</dd></div>
            <div><dt>Next</dt><dd>{text(snapshot?.mission?.next)}</dd></div>
            <div><dt>Blockers</dt><dd>{text(snapshot?.mission?.blockers)}</dd></div>
            <div><dt>Human gate</dt><dd>{text(snapshot?.mission?.needsHuman)}</dd></div>
          </dl>
        </div>

        <div className={styles.panel}>
          <header className={styles.panelHead}><div><span>Runtime</span><h2>Control-plane health</h2></div></header>
          <div className={styles.healthList}>
            <div><span>Statefeed</span><strong>{snapshot?.telemetry?.stateFeed ? "Online" : "Niet bevestigd"}</strong></div>
            <div><span>Scheduler telemetry</span><strong>{snapshot?.telemetry?.scheduler ? "Online" : "Niet bevestigd"}</strong></div>
            <div><span>Provider cooldown</span><strong>{snapshot?.telemetry?.exactProviderCooldown ? "Exact" : "Niet bevestigd"}</strong></div>
            <div><span>Research gateway</span><strong>{snapshot?.connections?.research?.state || "—"}</strong></div>
            <div><span>Production gateway</span><strong>{snapshot?.connections?.production?.state || "—"}</strong></div>
            <div><span>Builder gateway</span><strong>{snapshot?.connections?.builder?.state || "—"}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.activity}>
        <header className={styles.panelHead}><div><span>Activity</span><h2>Recente runtime-events</h2></div></header>
        <div className={styles.timeline}>
          {events.length ? events.map((item, index) => (
            <article key={index}>
              <i />
              <div><strong>{eventTitle(item)}</strong><p>{eventBody(item)}</p></div>
              <time>{formatDate(item.timestamp || item.ts)}</time>
            </article>
          )) : <div className={styles.empty}>Geen recente events in de statefeed.</div>}
        </div>
      </section>

      <details className={styles.technical}>
        <summary>Technische state en evidence</summary>
        <pre>{JSON.stringify({ mission: snapshot?.mission, lastReview: snapshot?.lastReview, fixtureReview: snapshot?.fixtureReview, safety: snapshot?.safety }, null, 2)}</pre>
      </details>
    </HermesShell>
  );
}
