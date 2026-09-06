"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./research-control-center.module.css";

type RecordLike = Record<string, unknown>;

type AutonomyResponse = {
  connected?: boolean;
  state?: string;
  message?: string;
  snapshot?: RecordLike;
};

type BrainStatus = {
  production?: { state?: string; profile?: string; message?: string };
  research?: { state?: string; profile?: string; message?: string };
  builder?: { state?: string; profile?: string; message?: string };
};

type RuntimeResponse = {
  connected?: boolean;
  mode?: string;
  currentTask?: string | null;
  currentFixture?: number | null;
  lastCompletedWork?: unknown;
  next?: unknown;
  blockers?: unknown;
  needsHuman?: unknown;
  provider?: {
    name?: string;
    model?: string;
    state?: string;
    retryNotBeforeUtc?: string | null;
    retryAfterSeconds?: number | null;
    cooldownSource?: string | null;
  };
  scheduler?: {
    id?: string;
    name?: string;
    active?: boolean;
    schedule?: unknown;
    nextRun?: unknown;
    lastRun?: unknown;
    lastStatus?: unknown;
  } | null;
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
  telemetry?: {
    stateFeed?: boolean;
    scheduler?: boolean;
    compute?: boolean;
    exactProviderCooldown?: boolean;
  };
  safety?: RecordLike;
  messages?: string[];
  generatedAt?: string;
  readOnly?: boolean;
  modelLaunch?: boolean;
};

type Tone = "good" | "warn" | "bad" | "muted";

type PipelineStep = {
  id: string;
  number: number;
  state: "done" | "active" | "waiting" | "next" | "pending";
};

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

function compact(value: unknown, max = 180) {
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
  return `${new Intl.NumberFormat("nl-NL").format(value)} / ${new Intl.NumberFormat("nl-NL").format(max)}`;
}

function toneForMode(mode?: string): Tone {
  if (mode === "human_gate") return "bad";
  if (mode === "provider_cooldown") return "warn";
  if (mode === "scheduled") return "good";
  if (mode === "offline") return "bad";
  return "muted";
}

function modeLabel(mode?: string) {
  if (mode === "human_gate") return "Jouw actie nodig";
  if (mode === "provider_cooldown") return "Wacht op provider";
  if (mode === "scheduled") return "Automatisch actief";
  if (mode === "offline") return "Runtime offline";
  return "Klaar / wachtend";
}

function providerLabel(runtime: RuntimeResponse | null) {
  if (runtime?.provider?.state === "cooldown") return "Cooldown";
  if (runtime?.provider?.state === "ready_or_unknown") return "Beschikbaar / niet geblokkeerd";
  return "Niet vastgesteld";
}

function pipeline(currentFixture: number | null | undefined, mode?: string): PipelineStep[] {
  if (!currentFixture) return [];
  return Array.from({ length: 20 }, (_, index) => {
    const number = 11 + index;
    let state: PipelineStep["state"] = "pending";
    if (number < currentFixture) state = "done";
    else if (number === currentFixture) state = mode === "provider_cooldown" ? "waiting" : "active";
    else if (number === currentFixture + 1) state = "next";
    return { id: `FS-I${number}`, number, state };
  });
}

function Dot({ tone }: { tone: Tone }) {
  return <span className={`${styles.dot} ${styles[`dot_${tone}`]}`} />;
}

function HealthRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  const tone: Tone = ok === true ? "good" : ok === false ? "bad" : "warn";
  return <div className={styles.healthRow}><Dot tone={tone} /><div><strong>{label}</strong><span>{detail}</span></div></div>;
}

export function ResearchControlCenter() {
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyResponse | null>(null);
  const [brain, setBrain] = useState<BrainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [runtimeResponse, autonomyResponse, brainResponse] = await Promise.all([
        fetch("/api/brain/runtime", { cache: "no-store" }),
        fetch("/api/brain/autonomy", { cache: "no-store" }),
        fetch("/api/brain/status", { cache: "no-store" }),
      ]);
      setRuntime((await runtimeResponse.json()) as RuntimeResponse);
      setAutonomy((await autonomyResponse.json()) as AutonomyResponse);
      setBrain((await brainResponse.json()) as BrainStatus);
      setLastRefresh(new Date());
    } catch {
      setRuntime({ connected: false, mode: "offline", messages: ["De research-runtime kon niet worden geladen."] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const snapshot = record(autonomy?.snapshot);
  const current = record(snapshot.current);
  const experiments = record(snapshot.experiments);
  const backlog = record(snapshot.backlog);
  const recentExperiments = rows(experiments.recent || experiments.entries).slice(0, 5);
  const backlogEntries = rows(backlog.entries).slice(0, 6);
  const steps = useMemo(() => pipeline(runtime?.currentFixture, runtime?.mode), [runtime?.currentFixture, runtime?.mode]);
  const tone = toneForMode(runtime?.mode);
  const compute = runtime?.compute;
  const retryTime = runtime?.provider?.retryNotBeforeUtc;
  const currentTask = runtime?.currentTask || text(current.current_task, "Geen actieve mission geladen");
  const lastCompleted = runtime?.lastCompletedWork || current.last_completed_work;
  const researchConnected = brain?.research?.state === "connected";
  const schedulerActive = runtime?.scheduler?.active === true;
  const stateFeedConnected = runtime?.telemetry?.stateFeed === true || autonomy?.connected === true;
  const computeAvailable = runtime?.telemetry?.compute === true || compute?.available === true;

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><b>H</b><span><strong>Hermes</strong><small>Investment OS</small></span></Link>
      <nav className={styles.nav}>
        <Link href="/">Overzicht</Link>
        <Link href="/onderzoek" className={styles.active}>Onderzoek</Link>
        <Link href="/trading">Trading</Link>
        <Link href="/instellingen">Instellingen</Link>
      </nav>
      <div className={styles.headerRight}><span><Dot tone={tone} />{modeLabel(runtime?.mode)}</span><button onClick={() => void refresh()} disabled={loading}>{loading ? "Verversen…" : "Ververs"}</button></div>
    </header>

    <main className={styles.main}>
      <section className={`${styles.runtimeHero} ${styles[`runtimeHero_${tone}`]}`}>
        <div className={styles.heroTop}>
          <div><span className={styles.eyebrow}>Research runtime</span><div className={styles.runtimeState}><Dot tone={tone} /><strong>{modeLabel(runtime?.mode)}</strong></div></div>
          <div className={styles.readOnly}>READ-ONLY OBSERVABILITY</div>
        </div>
        <h1>{runtime?.mode === "provider_cooldown" ? "Hermes wacht veilig op nieuwe modelcapaciteit." : runtime?.mode === "human_gate" ? "Hermes wacht op een echte menselijke beslissing." : "Hermes Research draait gecontroleerd en zelfstandig."}</h1>
        <p>{runtime?.mode === "provider_cooldown" ? "De scheduler blijft actief, maar start geen nieuwe review zolang de provider-cooldown geldt. De huidige mission blijft intact en wordt daarna automatisch opnieuw beoordeeld." : "Deze pagina leest alleen echte research-state uit. Er zijn hier bewust geen knoppen voor force retry, mission skipping of live execution."}</p>
        <div className={styles.heroGrid}>
          <div><span>Current mission</span><strong>{currentTask}</strong></div>
          <div><span>Provider</span><strong>{providerLabel(runtime)}</strong><small>{runtime?.provider?.model || "gpt-5.6-sol"}</small></div>
          <div><span>Volgende automatische retry</span><strong>{retryTime ? formatDate(retryTime, true) : formatDate(runtime?.scheduler?.nextRun)}</strong><small>{runtime?.provider?.cooldownSource === "state_feed" ? "exact uit state feed" : runtime?.provider?.cooldownSource === "scheduler_inference" ? "afgeleid uit scheduler" : "scheduler planning"}</small></div>
          <div><span>Laatste resultaat</span><strong>{compact(lastCompleted, 90)}</strong></div>
        </div>
      </section>

      <section className={styles.quickGrid}>
        <article><span>GPT request nu</span><strong>{runtime?.modelLaunch === false ? "Nee" : "Niet vastgesteld"}</strong><p>Deze statuspagina start zelf nooit een model.</p></article>
        <article><span>Open reservations</span><strong>{number(compute?.openReservations)}</strong><p>{computeAvailable ? "Uit compute-telemetrie." : "Nog niet in de read-only feed."}</p></article>
        <article><span>Voided reservations</span><strong>{number(compute?.voidedReservations)}</strong><p>{computeAvailable ? "Veilig geneutraliseerde pre-provider starts." : "Nog niet in de read-only feed."}</p></article>
        <article><span>Execution safety</span><strong className={styles.locked}>NO_ACTION</strong><p>Deze UI kan geen live orders of brokerbinding activeren.</p></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Research pipeline</span><h2>Waar Hermes nu zit</h2></div><small>{runtime?.currentFixture ? `FS-I${runtime.currentFixture} actief` : "Fixture niet beschikbaar"}</small></div>
        {steps.length ? <div className={styles.pipeline}>{steps.map((step) => <div key={step.id} className={`${styles.pipelineStep} ${styles[`pipeline_${step.state}`]}`}><span>{step.state === "done" ? "✓" : step.state === "waiting" ? "◷" : step.state === "active" ? "●" : step.state === "next" ? "→" : "○"}</span><strong>{step.id}</strong><small>{step.state === "done" ? "afgerond" : step.state === "waiting" ? "wacht" : step.state === "active" ? "actief" : step.state === "next" ? "hierna" : "pending"}</small></div>)}</div> : <div className={styles.notice}>De actieve FS-I fixture staat nog niet in de huidige state feed. De OS toont daarom geen verzonnen pipeline.</div>}
      </section>

      <section className={styles.columns}>
        <div className={styles.card}>
          <div className={styles.cardHead}><span>AI / compute</span><h2>Budget en gebruik</h2></div>
          <div className={styles.metricRows}>
            <div><span>Runs 24h</span><strong>{ratio(compute?.runs24h, compute?.maxRuns24h)}</strong></div>
            <div><span>Prompt tokens 24h</span><strong>{ratio(compute?.promptTokens24h, compute?.maxPromptTokens24h)}</strong></div>
            <div><span>Total tokens 24h</span><strong>{ratio(compute?.totalTokens24h, compute?.maxTotalTokens24h)}</strong></div>
            <div><span>Context bytes</span><strong>{ratio(compute?.estimatedContextBytes, compute?.maxContextBytes)}</strong></div>
          </div>
          {!computeAvailable && <div className={styles.telemetryGap}><strong>Compute-telemetrie nog niet gekoppeld</strong><p>Mission- en schedulerstate zijn live zichtbaar. Exacte budgetcounters worden pas getoond zodra de read-only VPS state feed ze exposeert; het OS vult hier bewust niets zelf in.</p></div>}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}><span>System health</span><h2>Wat functioneert</h2></div>
          <div className={styles.healthList}>
            <HealthRow label="Research gateway" ok={researchConnected} detail={researchConnected ? "his-research bereikbaar" : "Researchprofiel niet volledig groen"} />
            <HealthRow label="Research scheduler" ok={runtime?.telemetry?.scheduler ?? null} detail={schedulerActive ? `${runtime?.scheduler?.name || "Research Review Router"} actief` : "Scheduler niet actief of niet zichtbaar"} />
            <HealthRow label="Mission state feed" ok={stateFeedConnected} detail={stateFeedConnected ? "Read-only snapshot beschikbaar" : "Snapshot niet bereikbaar"} />
            <HealthRow label="Compute telemetry" ok={computeAvailable ? true : null} detail={computeAvailable ? "Budgetcounters beschikbaar" : "Nog niet opgenomen in state feed"} />
            <HealthRow label="Execution boundary" ok={true} detail="Live trading blijft buiten deze research UI" />
          </div>
        </div>
      </section>

      <section className={styles.columns}>
        <div className={styles.card}>
          <div className={styles.cardHead}><span>Nu / hierna</span><h2>Mission context</h2></div>
          <dl className={styles.definitionList}>
            <div><dt>Nu</dt><dd>{compact(current.current_objective || current.in_progress, 240)}</dd></div>
            <div><dt>Hierna</dt><dd>{compact(runtime?.next || current.next, 240)}</dd></div>
            <div><dt>Blockers</dt><dd>{compact(runtime?.blockers || current.blockers, 240)}</dd></div>
            <div><dt>Needs human</dt><dd>{compact(runtime?.needsHuman || current.needs_human, 240)}</dd></div>
          </dl>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}><span>Scheduler</span><h2>Automatische research</h2></div>
          <dl className={styles.definitionList}>
            <div><dt>Job</dt><dd>{runtime?.scheduler?.name || "Niet zichtbaar"}</dd></div>
            <div><dt>Status</dt><dd>{schedulerActive ? "Actief" : "Niet actief / onbekend"}</dd></div>
            <div><dt>Laatste run</dt><dd>{formatDate(runtime?.scheduler?.lastRun, true)}</dd></div>
            <div><dt>Laatste status</dt><dd>{text(runtime?.scheduler?.lastStatus)}</dd></div>
            <div><dt>Volgende tick</dt><dd>{formatDate(runtime?.scheduler?.nextRun, true)}</dd></div>
          </dl>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Recente activity</span><h2>Wat Hermes heeft vastgelegd</h2></div><small>State snapshot</small></div>
        <div className={styles.activityList}>{recentExperiments.length ? recentExperiments.map((item, index) => <article key={`${text(item.experiment_id)}-${index}`}><div><span>{text(item.verdict, "RESULT")}</span><strong>{compact(item.hypothesis || item.experiment_id, 120)}</strong><p>{compact(item.result, 220)}</p></div><time>{formatDate(item.timestamp)}</time></article>) : <div className={styles.notice}>Nog geen recente experimenten in de huidige snapshot.</div>}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Backlog</span><h2>Volgende veilige taken</h2></div><small>{backlogEntries.length} zichtbaar</small></div>
        <div className={styles.backlog}>{backlogEntries.length ? backlogEntries.map((item, index) => <article key={`${text(item.task_id)}-${index}`}><code>{text(item.task_id)}</code><div><strong>{compact(item.title || item.rationale || item.task_id, 140)}</strong><p>{compact(item.rationale, 190)}</p></div><span>{text(item.status, text(item.priority, "—"))}</span></article>) : <div className={styles.notice}>Geen backlog-items in de huidige snapshot.</div>}</div>
      </section>

      <section className={styles.safety}>
        <div><span>Safety boundary</span><h2>Observeren mag. Forceren niet.</h2><p>Er zijn bewust geen controls voor “Retry now”, “Force next mission”, “Clear reservation” of live execution. Eerst moet de automatische researchketen zichzelf betrouwbaar bewijzen.</p></div>
        <div className={styles.safetyGrid}><span>✓ Read-only runtime</span><span>✓ Geen modelcall door dashboard</span><span>✓ Geen reservation mutation</span><span>✓ Geen live trading</span></div>
      </section>

      {(runtime?.messages?.length || !runtime?.telemetry?.exactProviderCooldown) && <details className={styles.details}><summary>Technische telemetry-info</summary><pre>{JSON.stringify({ runtime, generatedAt: runtime?.generatedAt, lastRefresh: lastRefresh?.toISOString() }, null, 2)}</pre></details>}
    </main>
  </div>;
}
