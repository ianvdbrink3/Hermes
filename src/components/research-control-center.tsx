"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type PipelineState = "done" | "active" | "waiting" | "next" | "pending" | "unknown";

type PipelineStep = { id: string; number: number; state: PipelineState };

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function rows(value: unknown): RecordLike[] {
  return Array.isArray(value)
    ? value.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compact(value: unknown, max = 200) {
  const source = text(value, "").replace(/\s+/g, " ").trim();
  if (!source) return "—";
  return source.length > max ? `${source.slice(0, max - 1)}…` : source;
}

function formatDate(value: unknown, seconds = false) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(date);
}

function number(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("nl-NL").format(value);
}

function ratio(value: number | null | undefined, max: number | null | undefined) {
  if (value === null || value === undefined || max === null || max === undefined) return "—";
  return `${number(value)} / ${number(max)}`;
}

function stateTone(state?: RuntimeState): HermesTone {
  if (state === "READY" || state === "RUNNING") return "good";
  if (["WAITING_PROVIDER", "WAITING_PROVIDER_UNVERIFIED", "WAITING_BUDGET", "WAITING_SPACING", "IDLE", "DEGRADED"].includes(state || "")) return "warn";
  if (["NEEDS_HUMAN", "BLOCKED_UNVERIFIED_USAGE", "BLOCKED_INTEGRITY", "OFFLINE"].includes(state || "")) return "bad";
  return "muted";
}

function stateLabel(state?: RuntimeState) {
  const labels: Partial<Record<RuntimeState, string>> = {
    READY: "Klaar voor volgende review",
    RUNNING: "Onderzoek draait",
    WAITING_PROVIDER: "Wacht op modelprovider",
    WAITING_PROVIDER_UNVERIFIED: "Providerstatus moet worden bevestigd",
    WAITING_BUDGET: "Wacht op compute-budget",
    WAITING_SPACING: "Wacht op minimale tussenruimte",
    NEEDS_HUMAN: "Jouw actie nodig",
    BLOCKED_UNVERIFIED_USAGE: "Geblokkeerd: AI-gebruik niet verifieerbaar",
    BLOCKED_INTEGRITY: "Geblokkeerd: integriteitscontrole",
    IDLE: "Onderzoeksrouter niet actief",
    DEGRADED: "Gedeeltelijk beschikbaar",
    OFFLINE: "Research-runtime offline",
  };
  return state ? labels[state] || state : "Status laden…";
}

function heroTitle(state?: RuntimeState) {
  if (state === "WAITING_PROVIDER") return "Hermes wacht veilig op nieuwe modelcapaciteit.";
  if (state === "WAITING_PROVIDER_UNVERIFIED") return "Hermes ziet een providerprobleem, maar verzint geen retrytijd.";
  if (state === "WAITING_BUDGET") return "Hermes respecteert het ingestelde AI-budget.";
  if (state === "NEEDS_HUMAN") return "Hermes wacht op een echte menselijke beslissing.";
  if (state === "BLOCKED_UNVERIFIED_USAGE") return "Hermes stopt omdat AI-gebruik niet betrouwbaar kan worden vastgesteld.";
  if (state === "BLOCKED_INTEGRITY") return "Hermes stopt omdat een verificatie niet klopt.";
  if (state === "OFFLINE") return "De research-runtime is niet bereikbaar.";
  if (state === "RUNNING") return "Hermes voert nu een gecontroleerde onderzoeksreview uit.";
  return "Hermes Research werkt gecontroleerd en zelfstandig.";
}

function reviewedFixtures(snapshot: Snapshot | null) {
  const proven = new Set<number>();
  const source = record(snapshot?.sourceSnapshot);
  const explicitReviews = rows(source.reviews || record(source.runtime).reviews);
  const candidates = [...explicitReviews, ...(snapshot?.events || [])];
  for (const item of candidates) {
    const combined = `${text(item.fixture, "")} ${text(item.task_id, "")} ${text(item.event, "")} ${text(item.verdict, "")} ${text(item.outcome, "")}`;
    const match = combined.match(/FS-I(\d+)/i);
    const outcome = `${text(item.verdict, "")} ${text(item.outcome, "")} ${text(item.state, "")}`.toUpperCase();
    if (match && /PASS|COMPLETED|COMPLETE/.test(outcome)) proven.add(Number(match[1]));
  }
  return proven;
}

function buildPipeline(snapshot: Snapshot | null): PipelineStep[] {
  const current = snapshot?.mission?.fixtureNumber;
  if (!current) return [];
  const proven = reviewedFixtures(snapshot);
  const state = snapshot?.runtime?.state;
  return Array.from({ length: 20 }, (_, index) => {
    const number = 11 + index;
    let stepState: PipelineState = "pending";
    if (proven.has(number)) stepState = "done";
    else if (number < current) stepState = "unknown";
    else if (number === current) stepState = state === "WAITING_PROVIDER" || state === "WAITING_PROVIDER_UNVERIFIED" || state === "WAITING_BUDGET" || state === "WAITING_SPACING" ? "waiting" : "active";
    else if (number === current + 1) stepState = "next";
    return { id: `FS-I${number}`, number, state: stepState };
  });
}

function connectionLabel(state?: string) {
  if (state === "connected") return "Verbonden";
  if (state === "not_configured") return "Niet ingesteld";
  if (state === "auth_error") return "Authenticatie mislukt";
  if (state === "offline") return "Offline";
  if (state === "degraded") return "Beperkt";
  return "Onbekend";
}

function eventTitle(item: RecordLike) {
  return compact(item.title || item.event || item.type || item.state || "Runtime-event", 120);
}

export function ResearchControlCenter() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const source = record(snapshot?.sourceSnapshot);
  const experiments = record(source.experiments);
  const backlog = record(source.backlog);
  const recentExperiments = rows(experiments.recent || experiments.entries).slice(0, 5);
  const backlogEntries = rows(backlog.entries).slice(0, 6);
  const steps = useMemo(() => buildPipeline(snapshot), [snapshot]);
  const tone = stateTone(snapshot?.runtime?.state);
  const compute = snapshot?.compute;
  const events = snapshot?.events || [];
  const providerBlocked = snapshot?.provider?.state === "COOLDOWN" || snapshot?.provider?.state === "LIMITED_UNVERIFIED";
  const execution = text(snapshot?.safety?.execution, "Niet gerapporteerd");

  return (
    <HermesShell
      active="onderzoek"
      status={stateLabel(snapshot?.runtime?.state)}
      statusTone={tone}
      wide
      actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Verversen…" : "Ververs"}</button>}
    >
      <section className={`${styles.runtimeHero} ${styles[`runtimeHero_${tone}`]}`}>
        <div className={styles.heroTop}>
          <div><span className={styles.eyebrow}>Onderzoeksstatus</span><div className={styles.runtimeState}><i className={`${styles.dot} ${styles[`dot_${tone}`]}`} /><strong>{stateLabel(snapshot?.runtime?.state)}</strong></div></div>
          <div className={styles.readOnly}>ALLEEN OBSERVATIE</div>
        </div>
        <h1>{heroTitle(snapshot?.runtime?.state)}</h1>
        <p>{snapshot?.runtime?.reason || "Het OS toont de actuele research-state uit één versieerbaar runtimecontract. Het leidt geen providerstatus of afgeronde review af zonder bewijs."}</p>
        <div className={styles.heroGrid}>
          <div><span>Huidige stap</span><strong>{snapshot?.mission?.fixture || snapshot?.mission?.taskId || "—"}</strong><small>{compact(snapshot?.mission?.taskId, 90)}</small></div>
          <div><span>Modelstatus</span><strong>{providerBlocked ? "Geblokkeerd / wachtend" : "Niet geblokkeerd"}</strong><small>{snapshot?.provider?.model || "gpt-5.6-sol"}</small></div>
          <div><span>Volgende poging</span><strong>{snapshot?.provider?.cooldownActive ? formatDate(snapshot?.provider?.retryNotBeforeUtc, true) : formatDate(snapshot?.scheduler?.nextRun, true)}</strong><small>{snapshot?.provider?.cooldownActive ? "exacte cooldown" : "volgende schedulertick"}</small></div>
          <div><span>Laatste resultaat</span><strong>{compact(snapshot?.mission?.lastCompletedWork, 110)}</strong></div>
        </div>
      </section>

      <section className={styles.quickGrid}>
        <article><span>AI-run vanuit dit scherm</span><strong>Nee</strong><p>Deze pagina leest alleen state en start geen model.</p></article>
        <article><span>Open reservations</span><strong>{number(compute?.openReservations)}</strong><p>{compute?.available ? "Uit compute-telemetrie." : "Nog niet in de VPS-statefeed."}</p></article>
        <article><span>Voided reservations</span><strong>{number(compute?.voidedReservations)}</strong><p>{compute?.available ? "Veilig geneutraliseerde starts." : "Nog niet in de VPS-statefeed."}</p></article>
        <article><span>Execution</span><strong className={styles.locked}>{execution}</strong><p>Browseractivatie is hard uitgeschakeld.</p></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Onderzoekspipeline</span><h2>Waar Hermes nu zit</h2></div><small>{snapshot?.mission?.fixture ? `${snapshot.mission.fixture} huidig` : "Fixture niet beschikbaar"}</small></div>
        {steps.length ? <div className={styles.pipeline}>{steps.map((step) => <div key={step.id} className={`${styles.pipelineStep} ${styles[`pipeline_${step.state}`]}`}><span>{step.state === "done" ? "✓" : step.state === "waiting" ? "◷" : step.state === "active" ? "●" : step.state === "next" ? "→" : step.state === "unknown" ? "?" : "○"}</span><strong>{step.id}</strong><small>{step.state === "done" ? "bewezen pass" : step.state === "waiting" ? "wacht" : step.state === "active" ? "huidig" : step.state === "next" ? "hierna" : step.state === "unknown" ? "niet in feed" : "pending"}</small></div>)}</div> : <div className={styles.notice}>De actieve fixture staat niet in de statefeed. Het OS tekent daarom geen verzonnen voortgang.</div>}
      </section>

      <section className={styles.columns}>
        <div className={styles.card}>
          <div className={styles.cardHead}><span>AI & compute</span><h2>Budget en gebruik</h2></div>
          <div className={styles.metricRows}>
            <div><span>Runs 24 uur</span><strong>{ratio(compute?.runs24h, compute?.maxRuns24h)}</strong></div>
            <div><span>Prompttokens 24 uur</span><strong>{ratio(compute?.promptTokens24h, compute?.maxPromptTokens24h)}</strong></div>
            <div><span>Totale tokens 24 uur</span><strong>{ratio(compute?.totalTokens24h, compute?.maxTotalTokens24h)}</strong></div>
            <div><span>Contextbytes</span><strong>{ratio(compute?.estimatedContextBytes, compute?.maxContextBytes)}</strong></div>
          </div>
          {!compute?.available && <div className={styles.telemetryGap}><strong>Exacte compute-telemetrie ontbreekt nog</strong><p>De weblaag vult geen budgetcijfers zelf in. Zodra de VPS-statefeed budget, usage en reservation-ledgers publiceert, verschijnen ze hier automatisch.</p></div>}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}><span>Systeemgezondheid</span><h2>Wat functioneert</h2></div>
          <div className={styles.healthList}>
            <div className={styles.healthRow}><i className={`${styles.dot} ${styles[`dot_${snapshot?.connections?.research?.state === "connected" ? "good" : "bad"}`]}`} /><div><strong>Research gateway</strong><span>{connectionLabel(snapshot?.connections?.research?.state)}</span></div></div>
            <div className={styles.healthRow}><i className={`${styles.dot} ${styles[`dot_${snapshot?.scheduler?.found && snapshot?.scheduler?.active ? "good" : "warn"}`]}`} /><div><strong>Research Review Router</strong><span>{snapshot?.scheduler?.found ? (snapshot.scheduler.active ? "Actief" : "Gevonden maar niet actief") : "Niet gevonden — geen legacy fallback"}</span></div></div>
            <div className={styles.healthRow}><i className={`${styles.dot} ${styles[`dot_${snapshot?.telemetry?.stateFeed ? "good" : "bad"}`]}`} /><div><strong>Mission state feed</strong><span>{snapshot?.telemetry?.stateFeed ? "Beschikbaar" : "Niet bereikbaar"}</span></div></div>
            <div className={styles.healthRow}><i className={`${styles.dot} ${styles[`dot_${snapshot?.telemetry?.compute ? "good" : "warn"}`]}`} /><div><strong>Compute-telemetrie</strong><span>{snapshot?.telemetry?.compute ? "Beschikbaar" : "Nog niet in statefeed"}</span></div></div>
            <div className={styles.healthRow}><i className={`${styles.dot} ${styles.dot_good}`} /><div><strong>Browser execution boundary</strong><span>Trading-activatie hard geblokkeerd</span></div></div>
          </div>
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.card}>
          <div className={styles.cardHead}><span>Nu & hierna</span><h2>Mission context</h2></div>
          <dl className={styles.definitionList}>
            <div><dt>Doel</dt><dd>{compact(snapshot?.mission?.objective, 260)}</dd></div>
            <div><dt>Bezig</dt><dd>{compact(snapshot?.mission?.inProgress, 260)}</dd></div>
            <div><dt>Hierna</dt><dd>{compact(snapshot?.mission?.next, 260)}</dd></div>
            <div><dt>Blockers</dt><dd>{compact(snapshot?.mission?.blockers, 260)}</dd></div>
            <div><dt>Mens nodig</dt><dd>{compact(snapshot?.mission?.needsHuman, 260)}</dd></div>
          </dl>
        </div>
        <div className={styles.card}>
          <div className={styles.cardHead}><span>Automatische research</span><h2>Scheduler</h2></div>
          <dl className={styles.definitionList}>
            <div><dt>Job</dt><dd>{snapshot?.scheduler?.name || "Research Review Router niet gevonden"}</dd></div>
            <div><dt>Status</dt><dd>{snapshot?.scheduler?.active ? "Actief" : "Niet actief"}</dd></div>
            <div><dt>Laatste run</dt><dd>{formatDate(snapshot?.scheduler?.lastRun, true)}</dd></div>
            <div><dt>Laatste status</dt><dd>{text(snapshot?.scheduler?.lastStatus)}</dd></div>
            <div><dt>Volgende tick</dt><dd>{formatDate(snapshot?.scheduler?.nextRun, true)}</dd></div>
          </dl>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Runtime-audit</span><h2>Operationele gebeurtenissen</h2></div><small>{events.length ? `${events.length} uit statefeed` : "telemetrie ontbreekt"}</small></div>
        {events.length ? <div className={styles.activityList}>{events.slice(0, 12).map((item, index) => <article key={`${eventTitle(item)}-${index}`}><div><span>{text(item.type || item.event, "EVENT")}</span><strong>{eventTitle(item)}</strong><p>{compact(item.message || item.reason || item.result, 240)}</p></div><time>{formatDate(item.timestamp || item.ts || item.created_at, true)}</time></article>)}</div> : <div className={styles.telemetryGap}><strong>Deterministische runtime-events nog niet gepubliceerd</strong><p>Voor een volledige audit-timeline moet de VPS-statefeed run manifests, reservation/void-events en mission progression als read-only events publiceren. Het OS gebruikt experimenten niet als vervanging voor deze operationele waarheid.</p></div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Onderzoeksresultaten</span><h2>Recente experimenten</h2></div><small>inhoudelijke state</small></div>
        <div className={styles.activityList}>{recentExperiments.length ? recentExperiments.map((item, index) => <article key={`${text(item.experiment_id)}-${index}`}><div><span>{text(item.verdict, "RESULT")}</span><strong>{compact(item.hypothesis || item.experiment_id, 140)}</strong><p>{compact(item.result, 240)}</p></div><time>{formatDate(item.timestamp, true)}</time></article>) : <div className={styles.notice}>Nog geen recente experimenten in de huidige snapshot.</div>}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Backlog</span><h2>Volgende veilige taken</h2></div><small>{backlogEntries.length} zichtbaar</small></div>
        <div className={styles.backlog}>{backlogEntries.length ? backlogEntries.map((item, index) => <article key={`${text(item.task_id)}-${index}`}><code>{text(item.task_id)}</code><div><strong>{compact(item.title || item.rationale || item.task_id, 150)}</strong><p>{compact(item.rationale, 210)}</p></div><span>{text(item.status, text(item.priority, "—"))}</span></article>) : <div className={styles.notice}>Geen backlog-items in de huidige snapshot.</div>}</div>
      </section>

      <section className={styles.safety}>
        <div><span>Veiligheidsgrens</span><h2>Observeren mag. Forceren niet.</h2><p>Geen “Retry now”, mission-skip, reservation-delete of browsergestuurde live execution. Handmatige Hermes-runs worden eerst door de centrale runtimepolicy gecontroleerd.</p></div>
        <div className={styles.safetyGrid}><span>✓ Eén runtimewaarheid</span><span>✓ Geen legacy schedulerfallback</span><span>✓ Handmatige modelcalls gepolicy-gated</span><span>✓ Browser execution hard locked</span></div>
      </section>

      <details className={styles.details}><summary>Technische OS-snapshot</summary><pre>{JSON.stringify({ ...snapshot, lastBrowserRefresh: lastRefresh?.toISOString() }, null, 2)}</pre></details>
    </HermesShell>
  );
}
