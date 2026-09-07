"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { HermesShell, type HermesTone } from "./hermes-shell";
import styles from "./simple-hermes.module.css";

type Page = "overzicht" | "onderzoek" | "trading" | "instellingen";
type RecordLike = Record<string, unknown>;
type ChatMessage = { role: "user" | "hermes" | "system"; text: string };
type Run = { run_id?: string; status?: string; output?: string; error?: string; policy?: { code?: string }; invocationPolicy?: { code?: string } };

type Snapshot = {
  runtime?: { state?: string; reason?: string | null };
  mission?: {
    taskId?: string | null;
    fixture?: string | null;
    nextFixture?: string | null;
    objective?: unknown;
    inProgress?: unknown;
    next?: unknown;
    blockers?: unknown;
    needsHuman?: unknown;
    lastCompletedWork?: unknown;
  };
  provider?: { model?: string; state?: string; retryNotBeforeUtc?: string | null; cooldownActive?: boolean };
  scheduler?: { found?: boolean; active?: boolean; name?: string | null; nextRun?: unknown; lastRun?: unknown; lastStatus?: unknown };
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
  };
  safety?: RecordLike;
  connections?: {
    production?: { configured?: boolean; state?: string };
    research?: { configured?: boolean; state?: string };
    builder?: { configured?: boolean; state?: string };
  };
  telemetry?: { stateFeed?: boolean; scheduler?: boolean; compute?: boolean; exactProviderCooldown?: boolean; runtimeEvents?: boolean };
  events?: RecordLike[];
  sourceSnapshot?: RecordLike;
  generatedAt?: string;
  deployment?: { version?: string; release?: string; shortCommit?: string; environment?: string };
};

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function rows(value: unknown): RecordLike[] {
  return Array.isArray(value)
    ? value.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function rawText(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function clean(value: unknown) {
  return rawText(value, "").replace(/\s+/g, " ").trim();
}

function short(value: unknown, max = 210) {
  const text = clean(value);
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatDate(value: unknown, withDate = false) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return rawText(value);
  return new Intl.DateTimeFormat("nl-NL", withDate
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("nl-NL").format(value);
}

function ratio(value: number | null | undefined, max: number | null | undefined) {
  if (value === null || value === undefined || max === null || max === undefined) return "—";
  return `${formatNumber(value)} / ${formatNumber(max)}`;
}

function clearHumanGate(value: unknown) {
  const normalized = clean(value).toLowerCase().replace(/[.!?;:,]+$/g, "").trim();
  return !normalized || ["none", "nothing", "geen", "n/a", "null", "no human gate", "no human action", "nothing required", "geen actie nodig"].includes(normalized);
}

function stateTone(state?: string): HermesTone {
  if (state === "READY" || state === "RUNNING") return "good";
  if (["WAITING_PROVIDER", "WAITING_PROVIDER_UNVERIFIED", "WAITING_BUDGET", "WAITING_SPACING", "IDLE", "DEGRADED"].includes(state || "")) return "warn";
  if (["NEEDS_HUMAN", "BLOCKED_UNVERIFIED_USAGE", "BLOCKED_INTEGRITY", "OFFLINE"].includes(state || "")) return "bad";
  return "muted";
}

function stateLabel(state?: string) {
  const labels: Record<string, string> = {
    READY: "Klaar voor onderzoek",
    RUNNING: "Onderzoek draait",
    WAITING_PROVIDER: "Wacht op modelprovider",
    WAITING_PROVIDER_UNVERIFIED: "Providerstatus onzeker",
    WAITING_BUDGET: "Wacht op AI-budget",
    WAITING_SPACING: "Wacht op volgende venster",
    NEEDS_HUMAN: "Jouw actie nodig",
    BLOCKED_UNVERIFIED_USAGE: "Geblokkeerd: usage onzeker",
    BLOCKED_INTEGRITY: "Geblokkeerd: verificatie",
    IDLE: "Router niet actief",
    DEGRADED: "Gedeeltelijk beschikbaar",
    OFFLINE: "Runtime offline",
  };
  return state ? labels[state] || state : "Status laden…";
}

function overviewTitle(snapshot: Snapshot | null) {
  const state = snapshot?.runtime?.state;
  if (state === "WAITING_PROVIDER") return "Hermes wacht veilig op nieuwe modelcapaciteit.";
  if (state === "WAITING_PROVIDER_UNVERIFIED") return "Hermes ziet een providerprobleem en wacht op betrouwbare state.";
  if (state === "WAITING_BUDGET") return "Hermes stopt tijdelijk omdat het AI-budget is bereikt.";
  if (state === "NEEDS_HUMAN") return "Hermes heeft jouw beslissing nodig voordat hij verder kan.";
  if (state === "BLOCKED_UNVERIFIED_USAGE") return "Hermes is fail-closed gestopt omdat AI-gebruik niet verifieerbaar is.";
  if (state === "BLOCKED_INTEGRITY") return "Hermes is gestopt bij een integriteitscontrole.";
  if (state === "RUNNING") return "Hermes voert nu een gecontroleerde researchreview uit.";
  if (state === "OFFLINE") return "De research-runtime is momenteel niet bereikbaar.";
  return "Hermes bewaakt en verbetert het investeringssysteem binnen vaste grenzen.";
}

function connectionLabel(state?: string) {
  if (state === "connected") return "Verbonden";
  if (state === "degraded") return "Beperkt beschikbaar";
  if (state === "not_configured") return "Niet ingesteld";
  if (state === "auth_error") return "Toegang mislukt";
  if (state === "offline") return "Offline";
  return "Onbekend";
}

function experimentTitle(item: RecordLike) {
  const source = `${clean(item.hypothesis)} ${clean(item.result)} ${clean(item.experiment_id)}`.toLowerCase();
  if (source.includes("sandbox") || source.includes("bwrap")) return "Veilige werkomgeving gecontroleerd";
  if (source.includes("quality") || source.includes("pytest") || source.includes("verification")) return "Technische controles uitgevoerd";
  if (source.includes("robust") || source.includes("backtest")) return "Onderzoeksresultaat opnieuw getest";
  if (source.includes("data")) return "Datakwaliteit onderzocht";
  return "Onderzoekscyclus afgerond";
}

export function SimpleHermes({ page }: { page: Page }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "hermes", text: "Vraag mij iets over het onderzoek of het systeem. Elke handmatige modelrun wordt eerst door de centrale runtimepolicy gecontroleerd. Live trading blijft geblokkeerd." },
  ]);
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSnapshot((await response.json()) as Snapshot);
      setLastRefresh(new Date());
    } catch {
      setSnapshot({ runtime: { state: "OFFLINE", reason: "De centrale OS-state kon niet worden geladen." } });
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
  const quality = record(source.quality);
  const git = record(source.git);
  const experimentEntries = rows(experiments.recent || experiments.entries).slice(0, 6);
  const decisions = rows(source.decisions).slice(0, 5);
  const backlogEntries = rows(backlog.entries).slice(0, 6);
  const needsYou = !clearHumanGate(snapshot?.mission?.needsHuman);
  const tone = stateTone(snapshot?.runtime?.state);
  const status = stateLabel(snapshot?.runtime?.state);
  const compute = snapshot?.compute;

  const summary = useMemo(() => {
    const expCounts = record(experiments.counts);
    return {
      pass: Number(expCounts.pass || expCounts.PASS || 0),
      reject: Number(expCounts.reject || expCounts.REJECT || 0),
      inconclusive: Number(expCounts.inconclusive || expCounts.INCONCLUSIVE || 0),
    };
  }, [experiments]);

  async function askHermes(event: FormEvent) {
    event.preventDefault();
    const input = chatInput.trim();
    if (!input || chatBusy) return;
    setChatMessages((items) => [...items, { role: "user", text: input }]);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, environment: "research", session_id: "simple-hermes-owner", source: "manual_chat" }),
      });
      const started = (await response.json()) as Run;
      if (!response.ok || started.error || !started.run_id) throw new Error(started.error || `Hermes-run geblokkeerd (${started.policy?.code || response.status}).`);
      let run = started;
      for (let attempt = 0; attempt < 90 && !["completed", "failed", "cancelled", "stopped"].includes(String(run.status)); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        const poll = await fetch(`/api/brain/runs/${encodeURIComponent(started.run_id)}?environment=research`, { cache: "no-store" });
        run = (await poll.json()) as Run;
      }
      if (run.status === "completed") {
        setChatMessages((items) => [...items, { role: "hermes", text: run.output || "Klaar. Hermes heeft deze stap afgerond." }]);
      } else {
        setChatMessages((items) => [...items, { role: "system", text: run.error || "Deze Hermes-run is niet succesvol afgerond." }]);
      }
      void refresh();
    } catch (error) {
      setChatMessages((items) => [...items, { role: "system", text: error instanceof Error ? error.message : "Hermes is tijdelijk niet bereikbaar." }]);
    } finally {
      setChatBusy(false);
    }
  }

  function Overview() {
    const eventEntries = snapshot?.events || [];
    return <>
      <section className={`${styles.hero} ${styles[`hero_${tone}`]}`}>
        <div className={styles.heroState}><span>{status}</span><span>{snapshot?.provider?.cooldownActive ? `Retry ${formatDate(snapshot.provider.retryNotBeforeUtc, true)}` : snapshot?.scheduler?.active ? `Volgende controle ${formatDate(snapshot.scheduler.nextRun, true)}` : "Geen actieve schedulertick"}</span></div>
        <h1>{overviewTitle(snapshot)}</h1>
        <p>{snapshot?.runtime?.reason || "Eén centrale runtime-state bepaalt wat alle OS-pagina's tonen. Geen oude heartbeat en geen geschatte providerstatus."}</p>
        <div className={styles.heroActions}><Link href="/onderzoek" className={styles.primaryLink}>Open onderzoek</Link><button onClick={() => setChatOpen(true)} className={styles.secondaryButton}>Vraag Hermes</button></div>
      </section>

      <section className={styles.dashboardGrid}>
        <article><span>Huidige mission</span><strong>{snapshot?.mission?.fixture || "—"}</strong><p>{short(snapshot?.mission?.taskId, 120)}</p></article>
        <article><span>Laatste resultaat</span><strong>{snapshot?.mission?.lastCompletedWork ? "Afgerond" : "—"}</strong><p>{short(snapshot?.mission?.lastCompletedWork, 140)}</p></article>
        <article><span>AI vandaag</span><strong>{ratio(compute?.promptTokens24h, compute?.maxPromptTokens24h)}</strong><p>{compute?.available ? `${ratio(compute?.runs24h, compute?.maxRuns24h)} runs` : "Compute-telemetrie nog niet in statefeed"}</p></article>
        <article className={needsYou ? styles.actionNeeded : styles.actionClear}><span>Jouw actie</span><strong>{needsYou ? "Actie nodig" : "Niets nodig"}</strong><p>{needsYou ? short(snapshot?.mission?.needsHuman, 140) : "Hermes kan binnen de ingestelde grenzen zelfstandig verder."}</p></article>
        <article><span>Execution</span><strong className={styles.locked}>Geblokkeerd</strong><p>Browseractivatie van trading is hard uitgeschakeld.</p></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Wat is veranderd</span><h2>Recente activiteit</h2></div><Link href="/onderzoek">Volledig onderzoek →</Link></div>
        <div className={styles.activityList}>
          {eventEntries.length ? eventEntries.slice(0, 5).map((item, index) => <article key={index}><div className={styles.activityIcon}>•</div><div><strong>{short(item.title || item.event || item.type, 130)}</strong><p>{short(item.message || item.reason || item.result, 170)}</p></div><span>{formatDate(item.timestamp || item.ts, true)}</span></article>) : experimentEntries.length ? experimentEntries.slice(0, 4).map((item, index) => <article key={`${rawText(item.experiment_id)}-${index}`}><div className={styles.activityIcon}>✓</div><div><strong>{experimentTitle(item)}</strong><p>{short(item.result || item.hypothesis, 170)}</p></div><span>{formatDate(item.timestamp, true)}</span></article>) : <div className={styles.empty}>Nog geen recente events of experimenten in de statefeed.</div>}
        </div>
      </section>

      <section className={styles.statsBand}>
        <div><strong>{summary.pass + summary.reject + summary.inconclusive}</strong><span>onderzoeken vastgelegd</span></div>
        <div><strong>{summary.pass}</strong><span>geslaagd</span></div>
        <div><strong>{formatNumber(compute?.voidedReservations)}</strong><span>voided reservations</span></div>
        <div><strong>{needsYou ? 1 : 0}</strong><span>acties voor jou</span></div>
      </section>

      <section className={styles.safetyBand}><div><span>Veiligheid</span><h2>Research mag leren. De browser mag geen live kapitaal activeren.</h2></div><div className={styles.safetyChecks}><span>✓ Browser execution hard locked</span><span>✓ Production modelruns inspect-only</span><span>✓ Researchcalls door runtimepolicy</span><span>✓ Onbekende state wordt niet ingevuld</span></div></section>
    </>;
  }

  function Trading() {
    const productionConnected = snapshot?.connections?.production?.state === "connected";
    return <>
      <section className={styles.pageIntro}><span>Trading</span><h1>Markt, posities en risico</h1><p>Deze pagina blijft bewust rustig totdat gecontroleerde broker- en marktdata beschikbaar zijn. Geen demo-data, geen verzonnen prijzen en geen browsergestuurde execution.</p></section>
      <section className={styles.tradingState}>
        <article><span>Production gateway</span><strong>{productionConnected ? "Verbonden" : connectionLabel(snapshot?.connections?.production?.state)}</strong><p>Alleen inspectie vanuit het OS.</p></article>
        <article><span>Live orders</span><strong className={styles.locked}>Hard geblokkeerd</strong><p>De `/api/risk/trading` browserroute kan trading niet meer activeren.</p></article>
        <article><span>Marktdata</span><strong>Nog niet zichtbaar</strong><p>Alleen gevalideerde feeds worden hier later getoond.</p></article>
        <article><span>Runtime safety</span><strong>{rawText(snapshot?.safety?.execution, "Niet gerapporteerd")}</strong><p>De backend blijft de autoriteit voor execution-state.</p></article>
      </section>
      <section className={styles.tradingExplain}><div><span>Wat Hermes nu wél kan</span><ul><li>Strategieën en hypotheses onderzoeken</li><li>Historische tests en robuustheidschecks uitvoeren</li><li>Risico's en fouten analyseren</li><li>Verbeteringen voorstellen met bewijs</li></ul></div><div><span>Wat Hermes nu niet kan</span><ul><li>Via dit OS live kapitaal activeren</li><li>Brokerbinding zelfstandig aanzetten</li><li>Risicolimieten versoepelen</li><li>Ontbrekende marktdata invullen</li></ul></div></section>
    </>;
  }

  function Settings() {
    const profiles = [
      { label: "Production", item: snapshot?.connections?.production },
      { label: "Research", item: snapshot?.connections?.research },
      { label: "Builder", item: snapshot?.connections?.builder },
    ];
    return <>
      <section className={styles.pageIntro}><span>Instellingen</span><h1>Systeem, verbindingen en Hermes-ontwikkeling</h1><p>Dagelijks gebruik hoort op Overzicht en Onderzoek. Hier staan de technische controles en de geavanceerde Brain Studio.</p></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Verbindingen</span><h2>Actuele profielen</h2></div><button onClick={() => void refresh()} disabled={loading}>{loading ? "Controleren…" : "Opnieuw controleren"}</button></div><div className={styles.connectionList}>{profiles.map(({ label, item }) => <article key={label}><div><strong>{label}</strong><span>{connectionLabel(item?.state)}</span></div><small>{item?.configured ? "Geconfigureerd" : "Niet geconfigureerd"}</small></article>)}</div></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Automatisering</span><h2>Research Review Router</h2></div></div><div className={styles.settingRows}><article><div><strong>Status</strong><span>Alleen de nieuwe Research Review Router telt als scheduler.</span></div><b className={snapshot?.scheduler?.active ? styles.okText : styles.warnText}>{snapshot?.scheduler?.active ? "Actief" : "Niet actief"}</b></article><article><div><strong>Volgende tick</strong><span>De eerstvolgende schedulercontrole.</span></div><b>{formatDate(snapshot?.scheduler?.nextRun, true)}</b></article><article><div><strong>Laatste browserrefresh</strong><span>Polling stopt wanneer deze tab niet zichtbaar is.</span></div><b>{lastRefresh ? formatDate(lastRefresh.toISOString(), true) : "—"}</b></article></div></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Release</span><h2>OS-versie</h2></div></div><div className={styles.settingRows}><article><div><strong>Versie</strong><span>{snapshot?.deployment?.release || "Hermes Investment OS"}</span></div><b>v{snapshot?.deployment?.version || "—"}</b></article><article><div><strong>Commit</strong><span>De deployment waarvan deze pagina draait.</span></div><b>{snapshot?.deployment?.shortCommit || "—"}</b></article></div></section>
      <section className={styles.advancedLinks}><div><span>Systeemgezondheid</span><h3>Diagnostiek en betrouwbaarheid</h3><p>Gateways, scheduler, deployment, beveiliging en permanente operationele checks.</p><Link href="/instellingen/systeem">Open systeemgezondheid →</Link></div><div><span>Geavanceerd</span><h3>Brain Studio</h3><p>Capabilities, researchconsole en gecontroleerde improvement proposals.</p><Link href="/instellingen/geavanceerd">Open Brain Studio →</Link></div></section>
      <details className={styles.techSummary}><summary>Ruwe OS-state</summary><pre>{JSON.stringify({ snapshot, quality, git, decisions, backlog: backlogEntries }, null, 2)}</pre></details>
    </>;
  }

  const active = page === "trading" ? "trading" : page === "instellingen" ? "instellingen" : "overzicht";
  return <>
    <HermesShell active={active} status={status} statusTone={tone} actions={<button onClick={() => setChatOpen(true)}>Praat met Hermes</button>}>
      {page === "overzicht" ? <Overview /> : page === "trading" ? <Trading /> : <Settings />}
    </HermesShell>
    <button className={styles.chatFab} onClick={() => setChatOpen(true)}><span>H</span><div><strong>Praat met Hermes</strong><small>{chatBusy ? "Hermes werkt…" : "Runtimepolicy actief"}</small></div></button>
    {chatOpen && <div className={styles.drawerBackdrop} onMouseDown={() => setChatOpen(false)}><aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}><header><div><span>Researchomgeving</span><h2>Praat met Hermes</h2><p>Handmatige modelcalls respecteren provider- en budgetstate.</p></div><button onClick={() => setChatOpen(false)}>×</button></header><div className={styles.chatThread}>{chatMessages.map((message, index) => <article key={index} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}><strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong><p>{message.text}</p></article>)}{chatBusy && <article className={styles.hermes}><strong>Hermes</strong><p>Runtimepolicy gecontroleerd; Hermes werkt…</p></article>}</div><form onSubmit={askHermes} className={styles.chatForm}><textarea rows={4} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Bijvoorbeeld: leg uit waarom FS-I13 wacht" /><div><small>Research only · provider/cost policy · live trading geblokkeerd</small><button disabled={chatBusy || !chatInput.trim()}>{chatBusy ? "Bezig…" : "Verstuur"}</button></div></form></aside></div>}
  </>;
}
