"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./simple-hermes.module.css";

type Page = "overzicht" | "onderzoek" | "trading" | "instellingen";
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

type BrainStatus = {
  production?: { state?: string; profile?: string; message?: string };
  research?: { state?: string; profile?: string; message?: string };
  builder?: { state?: string; profile?: string; message?: string };
};

type Health = { mode?: string; status?: string; ready?: boolean; message?: string };
type Run = { run_id?: string; status?: string; output?: string; error?: string };
type ChatMessage = { role: "user" | "hermes" | "system"; text: string };

const nav: Array<{ page: Page; label: string; href: string; icon: string }> = [
  { page: "overzicht", label: "Overzicht", href: "/", icon: "⌂" },
  { page: "onderzoek", label: "Onderzoek", href: "/onderzoek", icon: "◌" },
  { page: "trading", label: "Trading", href: "/trading", icon: "↗" },
  { page: "instellingen", label: "Instellingen", href: "/instellingen", icon: "⚙" },
];

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

function clearHumanGate(value: unknown) {
  const normalized = clean(value).toLowerCase().replace(/[.!?;:,]+$/g, "").trim();
  return !normalized || ["none", "nothing", "geen", "n/a", "null", "no human gate", "no human action", "nothing required", "geen actie nodig"].includes(normalized);
}

function formatDate(value: unknown, withDate = false) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return rawText(value);
  return new Intl.DateTimeFormat("nl-NL", withDate
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(date);
}

function short(value: unknown, max = 210) {
  const text = clean(value);
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function friendlyObjective(value: unknown) {
  const source = clean(value).toLowerCase();
  if (!source) return "Hermes bepaalt zelfstandig wat nu de belangrijkste volgende stap is.";
  if (source.includes("mismatch") || source.includes("output_hash") || source.includes("robustness")) return "Hermes onderzoekt waarom nieuwe onderzoeksresultaten afwijken van eerder opgeslagen resultaten.";
  if (source.includes("verification") || source.includes("pytest") || source.includes("quality gate")) return "Hermes controleert of zijn onderzoek en technische controles weer volledig betrouwbaar zijn.";
  if (source.includes("sandbox")) return "Hermes controleert of zijn veilige werkomgeving correct blijft werken.";
  if (source.includes("backtest")) return "Hermes controleert een strategie opnieuw met historische marktdata.";
  if (source.includes("data") || source.includes("point-in-time")) return "Hermes onderzoekt de kwaliteit en betrouwbaarheid van de gebruikte data.";
  if (source.includes("risk")) return "Hermes onderzoekt een risico in de strategie of het systeem.";
  return "Hermes werkt zelfstandig aan de hoogste-prioriteit verbetering van het investeringssysteem.";
}

function friendlyNext(value: unknown) {
  const source = clean(value).toLowerCase();
  if (!source) return "Hermes kiest na deze stap zelf wat daarna het belangrijkst is.";
  if (source.includes("mismatch") || source.includes("robustness") || source.includes("output_hash")) return "De afwijking reproduceren, de oorzaak vaststellen en alleen daarna bepalen wat aangepast moet worden.";
  if (source.includes("test") || source.includes("verify")) return "De volgende controle uitvoeren en het resultaat als bewijs vastleggen.";
  if (source.includes("backtest")) return "De test opnieuw uitvoeren en controleren of het resultaat buiten de oorspronkelijke steekproef standhoudt.";
  return "De eerstvolgende veilige onderzoekstaak uitvoeren en het resultaat vastleggen.";
}

function friendlyBlockers(value: unknown) {
  const source = clean(value);
  if (!source || clearHumanGate(source)) return "Geen blokkade waarvoor jij iets hoeft te doen.";
  const lower = source.toLowerCase();
  if (lower.includes("pytest") || lower.includes("test")) return "Er zijn technische controles die nog niet slagen. Hermes kan dit zelf onderzoeken.";
  if (lower.includes("credential") || lower.includes("permission") || lower.includes("approval")) return "Hermes heeft een menselijke toestemming of toegang nodig voordat hij verder kan.";
  return "Er is een blokkade vastgelegd. Bekijk de details als je wilt weten welke.";
}

function verdict(value: unknown) {
  const source = clean(value).toUpperCase();
  if (["PASS", "ACCEPT", "COMPLETE", "COMPLETED"].includes(source)) return { label: "Geslaagd", tone: "good" };
  if (["REJECT", "REJECTED", "FAILED", "FAIL"].includes(source)) return { label: "Verworpen", tone: "bad" };
  return { label: "Nog niet duidelijk", tone: "warn" };
}

function connectionLabel(state?: string) {
  if (state === "connected") return "Verbonden";
  if (state === "degraded") return "Beperkt beschikbaar";
  if (state === "not_configured") return "Niet ingesteld";
  if (state === "auth_error") return "Toegang mislukt";
  if (state === "offline") return "Offline";
  return "Controleren…";
}

function connectionTone(state?: string) {
  if (state === "connected") return "good";
  if (state === "degraded" || state === "not_configured") return "warn";
  return "bad";
}

function experimentTitle(item: RecordLike) {
  const source = `${clean(item.hypothesis)} ${clean(item.result)} ${clean(item.experiment_id)}`.toLowerCase();
  if (source.includes("sandbox") || source.includes("bwrap")) return "Veilige werkomgeving gecontroleerd";
  if (source.includes("quality") || source.includes("pytest") || source.includes("verification")) return "Technische controles uitgevoerd";
  if (source.includes("robust") || source.includes("backtest")) return "Onderzoeksresultaat opnieuw getest";
  if (source.includes("data")) return "Datakwaliteit onderzocht";
  return "Onderzoekscyclus afgerond";
}

function taskTitle(item: RecordLike) {
  const source = `${clean(item.task_id)} ${clean(item.rationale)} ${clean(item.title)}`.toLowerCase();
  if (source.includes("aut-002") || source.includes("mismatch") || source.includes("robust")) return "Verschil tussen oude en nieuwe onderzoeksresultaten verklaren";
  if (source.includes("sandbox")) return "Veilige Linux-werkomgeving afronden";
  if (source.includes("gate") || source.includes("pytest")) return "Alle technische controles herstellen";
  return short(item.title || item.rationale || item.task_id, 100);
}

function StatusDot({ tone }: { tone: "good" | "warn" | "bad" | "muted" }) {
  return <span className={`${styles.dot} ${styles[`dot_${tone}`]}`} />;
}

export function SimpleHermes({ page }: { page: Page }) {
  const [autonomy, setAutonomy] = useState<AutonomyResponse | null>(null);
  const [brain, setBrain] = useState<BrainStatus | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "hermes", text: "Je kunt mij hier iets vragen over mijn onderzoek, het systeem of mijn volgende stap. Deze chat werkt alleen in de onderzoeksomgeving en kan geen live orders plaatsen." },
  ]);
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [autonomyResponse, brainResponse, healthResponse] = await Promise.all([
        fetch("/api/brain/autonomy", { cache: "no-store" }),
        fetch("/api/brain/status", { cache: "no-store" }),
        fetch("/api/hermes/health", { cache: "no-store" }),
      ]);
      setAutonomy((await autonomyResponse.json()) as AutonomyResponse);
      setBrain((await brainResponse.json()) as BrainStatus);
      setHealth((await healthResponse.json()) as Health);
      setLastRefresh(new Date());
    } catch {
      setAutonomy({ connected: false, state: "offline", message: "De live status kon niet worden geladen." });
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
  const backlog = record(snapshot.backlog);
  const experiments = record(snapshot.experiments);
  const quality = record(snapshot.quality);
  const git = record(snapshot.git);
  const heartbeat = autonomy?.heartbeat?.heartbeat;
  const heartbeatActive = Boolean(heartbeat?.active);
  const humanGate = current.needs_human;
  const needsYou = !clearHumanGate(humanGate);
  const backlogEntries = rows(backlog.entries);
  const experimentEntries = rows(experiments.recent || experiments.entries).slice(0, 8);
  const decisions = rows(snapshot.decisions).slice(0, 6);
  const evidence = Array.isArray(current.important_evidence) ? current.important_evidence.map(String) : [];
  const expCounts = record(experiments.counts);
  const backlogCounts = record(backlog.counts);

  const summary = useMemo(() => ({
    pending: Number(backlogCounts.pending || backlogCounts.PENDING || 0),
    completed: Number(backlogCounts.complete || backlogCounts.COMPLETE || 0),
    pass: Number(expCounts.pass || expCounts.PASS || 0),
    reject: Number(expCounts.reject || expCounts.REJECT || 0),
    inconclusive: Number(expCounts.inconclusive || expCounts.INCONCLUSIVE || 0),
  }), [backlogCounts, expCounts]);

  const labTone: "good" | "warn" | "bad" = needsYou ? "bad" : autonomy?.connected && heartbeatActive ? "good" : "warn";
  const labLabel = needsYou ? "Jouw actie nodig" : autonomy?.connected && heartbeatActive ? "Hermes werkt zelfstandig" : autonomy?.connected ? "Hermes is klaar" : "Status niet beschikbaar";

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
        body: JSON.stringify({ input, environment: "research", session_id: "simple-hermes-owner" }),
      });
      const started = (await response.json()) as Run;
      if (!response.ok || started.error || !started.run_id) throw new Error(started.error || "Hermes kon niet starten.");
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

  function Header() {
    return <header className={styles.header}>
      <div className={styles.brand}><Link href="/"><b>H</b><span><strong>Hermes</strong><small>Investment OS</small></span></Link></div>
      <nav className={styles.nav}>{nav.map((item) => <Link key={item.page} href={item.href} className={item.page === page ? styles.navActive : ""}><i>{item.icon}</i>{item.label}</Link>)}</nav>
      <div className={styles.headerActions}>
        <div className={styles.compactStatus}><StatusDot tone={labTone} /><span>{labLabel}</span></div>
        <button onClick={() => setChatOpen(true)} className={styles.chatTop}>Praat met Hermes</button>
      </div>
    </header>;
  }

  function Overview() {
    return <>
      <section className={`${styles.hero} ${styles[`hero_${labTone}`]}`}>
        <div className={styles.heroState}><StatusDot tone={labTone} /><strong>{labLabel}</strong><span>{heartbeatActive ? `Volgende controle ${formatDate(heartbeat?.nextRun)}` : "Automatische controle niet zichtbaar"}</span></div>
        <h1>{needsYou ? "Hermes heeft jou nodig voordat hij verder kan." : friendlyObjective(current.current_objective)}</h1>
        <p>{needsYou ? "Er staat een echte menselijke beslissing of toestemming open. De rest van het veilige werk blijft waar mogelijk zelfstandig doorgaan." : "Hermes kiest zelf zijn volgende veilige onderzoekstaak, voert die uit, controleert het resultaat en gaat daarna zelfstandig verder."}</p>
        <div className={styles.heroActions}>
          <Link href="/onderzoek" className={styles.primaryLink}>Bekijk wat Hermes doet</Link>
          <button onClick={() => setChatOpen(true)} className={styles.secondaryButton}>Stel een vraag</button>
        </div>
        <details className={styles.rawDetail}><summary>Technische brontekst</summary><p>{rawText(current.current_objective, "Geen brontekst beschikbaar.")}</p></details>
      </section>

      <section className={styles.twoCards}>
        <article className={`${styles.actionCard} ${needsYou ? styles.actionNeeded : styles.actionClear}`}>
          <span>Jouw actie</span>
          <strong>{needsYou ? "Actie nodig" : "Niets nodig"}</strong>
          <p>{needsYou ? rawText(humanGate, "Hermes heeft een menselijke beslissing nodig.") : "Hermes kan op dit moment zelfstandig verder."}</p>
        </article>
        <article className={styles.resultCard}>
          <span>Laatste resultaat</span>
          <strong>{current.last_completed_work ? "Nieuwe stap afgerond" : "Nog geen resultaat geladen"}</strong>
          <p>{current.last_completed_work ? short(current.last_completed_work, 190) : "Zodra Hermes een cyclus afrondt verschijnt die hier."}</p>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Vandaag</span><h2>Wat Hermes heeft gedaan</h2></div><Link href="/onderzoek">Alles bekijken →</Link></div>
        <div className={styles.activityList}>
          {experimentEntries.length ? experimentEntries.slice(0, 4).map((item, index) => {
            const v = verdict(item.verdict);
            return <article key={`${rawText(item.experiment_id)}-${index}`}><div className={`${styles.activityIcon} ${styles[`tone_${v.tone}`]}`}>✓</div><div><strong>{experimentTitle(item)}</strong><p>{short(item.result || item.hypothesis, 160)}</p></div><span>{formatDate(item.timestamp, true)}</span></article>;
          }) : <div className={styles.empty}>Nog geen recente onderzoekscycli geladen.</div>}
        </div>
      </section>

      <section className={styles.statsBand}>
        <div><strong>{summary.pass + summary.reject + summary.inconclusive}</strong><span>onderzoeken vastgelegd</span></div>
        <div><strong>{summary.pass}</strong><span>geslaagd</span></div>
        <div><strong>{summary.reject}</strong><span>verworpen</span></div>
        <div><strong>{needsYou ? 1 : 0}</strong><span>acties voor jou</span></div>
      </section>

      <section className={styles.safetyBand}>
        <div><span>Veiligheid</span><h2>Hermes kan onderzoeken. Niet zelfstandig met geld handelen.</h2></div>
        <div className={styles.safetyChecks}><span>✓ Live trading uit</span><span>✓ Brokerbinding beschermd</span><span>✓ Risicolimieten beschermd</span><span>✓ Productiewijzigingen beschermd</span></div>
      </section>
    </>;
  }

  function Research() {
    return <>
      <section className={styles.pageIntro}>
        <span>Onderzoek</span><h1>Wat Hermes onderzoekt en leert</h1><p>Hier zie je alleen de informatie die nuttig is om te begrijpen waar Hermes mee bezig is. Technische details zijn ingeklapt.</p>
      </section>

      <section className={styles.currentWork}>
        <div className={styles.currentMain}><span>Nu bezig</span><h2>{friendlyObjective(current.current_objective)}</h2><p>{friendlyBlockers(current.blockers)}</p><details><summary>Originele technische omschrijving</summary><pre>{rawText(current.current_objective)}</pre></details></div>
        <div className={styles.nextCard}><span>Hierna</span><strong>{friendlyNext(current.next)}</strong><p>Hermes kiest daarna opnieuw zelfstandig de hoogste-prioriteit veilige stap.</p></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Komende taken</span><h2>Wat er op de onderzoekslijst staat</h2></div><small>{summary.pending} open</small></div>
        <div className={styles.taskList}>{backlogEntries.length ? backlogEntries.slice(0, 8).map((item, index) => <article key={`${rawText(item.task_id)}-${index}`}><div><span>{rawText(item.priority, "")}</span><h3>{taskTitle(item)}</h3><p>{short(item.rationale, 180)}</p></div><details><summary>Technische details</summary><pre>{JSON.stringify(item, null, 2)}</pre></details></article>) : <div className={styles.empty}>Geen open taken in de huidige snapshot.</div>}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Resultaten</span><h2>Wat Hermes heeft geleerd</h2></div></div>
        <div className={styles.experimentGrid}>{experimentEntries.length ? experimentEntries.map((item, index) => {
          const v = verdict(item.verdict);
          return <article key={`${rawText(item.experiment_id)}-${index}`}><div className={styles.experimentTop}><span className={`${styles.verdict} ${styles[`verdict_${v.tone}`]}`}>{v.label}</span><time>{formatDate(item.timestamp, true)}</time></div><h3>{experimentTitle(item)}</h3><p>{short(item.result || item.hypothesis, 230)}</p><details><summary>Waarom / technisch bewijs</summary><pre>{JSON.stringify(item, null, 2)}</pre></details></article>;
        }) : <div className={styles.empty}>Nog geen onderzoeksresultaten beschikbaar.</div>}</div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>Beslissingen</span><h2>Recente keuzes van Hermes</h2></div></div>
        <div className={styles.decisionList}>{decisions.length ? decisions.map((item, index) => <article key={index}><strong>{short(item.decision || item.title || item.action, 150)}</strong><p>{short(item.reason || item.rationale || item.result, 220)}</p><details><summary>Technische details</summary><pre>{JSON.stringify(item, null, 2)}</pre></details></article>) : <div className={styles.empty}>Nog geen afzonderlijke beslissingen in de snapshot.</div>}</div>
      </section>

      {evidence.length > 0 && <details className={styles.evidence}><summary>Belangrijk technisch bewijs ({evidence.length})</summary><ul>{evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    </>;
  }

  function Trading() {
    const productionConnected = brain?.production?.state === "connected";
    return <>
      <section className={styles.pageIntro}><span>Trading</span><h1>Markt, posities en risico</h1><p>Trading wordt pas uitgebreid getoond zodra er gecontroleerde markt- en brokerdata beschikbaar is. Het OS vult geen prijzen of posities in die het niet zeker weet.</p></section>
      <section className={styles.tradingState}>
        <article><span>Hermes kern</span><strong>{productionConnected ? "Online" : connectionLabel(brain?.production?.state)}</strong><p>{productionConnected ? "De goedgekeurde Hermes-omgeving is bereikbaar." : "De productieverbindingsstatus is niet volledig groen."}</p></article>
        <article><span>Live orders</span><strong className={styles.locked}>Uitgeschakeld</strong><p>Hermes kan vanuit deze interface geen live order plaatsen.</p></article>
        <article><span>Marktdata</span><strong>Nog niet zichtbaar</strong><p>Geen gecontroleerde live koersfeed wordt op dit moment in deze vereenvoudigde interface getoond.</p></article>
        <article><span>Risico</span><strong>Beschermd</strong><p>Autonome research mag harde risicolimieten niet verlagen of omzeilen.</p></article>
      </section>
      <section className={styles.tradingExplain}><div><span>Wat Hermes nu wél kan</span><ul><li>Strategieën en hypotheses onderzoeken</li><li>Historische tests uitvoeren</li><li>Fouten, robuustheid en risico analyseren</li><li>Nieuwe capabilities voorstellen en gecontroleerd laten bouwen</li></ul></div><div><span>Wat Hermes nu niet kan</span><ul><li>Zelfstandig live kapitaal inzetten</li><li>Brokerbinding activeren</li><li>Productieregels versoepelen</li><li>Ontbrekende marktdata verzinnen</li></ul></div></section>
      <section className={styles.placeholderPanel}><div><span>Later</span><h2>Hier komen alleen echte tradinggegevens</h2><p>Zodra LYNX/TWS en de goedgekeurde datastroom actief zijn, kan deze pagina echte posities, actuele risico's, fills en handelsgeschiedenis tonen. Tot die tijd blijft dit bewust rustig.</p></div></section>
    </>;
  }

  function Settings() {
    const profiles = [
      { label: "Live systeem", item: brain?.production },
      { label: "Onderzoeksomgeving", item: brain?.research },
      { label: "Bouwomgeving", item: brain?.builder },
    ];
    return <>
      <section className={styles.pageIntro}><span>Instellingen</span><h1>Verbindingen, veiligheid en systeem</h1><p>Alles wat technisch is staat hier. Voor normaal dagelijks gebruik hoef je deze pagina meestal niet te openen.</p></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Verbindingen</span><h2>Wat is aangesloten?</h2></div><button onClick={() => void refresh()} disabled={loading}>{loading ? "Controleren…" : "Opnieuw controleren"}</button></div><div className={styles.connectionList}>{profiles.map(({ label, item }) => { const tone = connectionTone(item?.state); return <article key={label}><StatusDot tone={tone}/><div><strong>{label}</strong><span>{connectionLabel(item?.state)}</span></div><small>{item?.message || ""}</small></article>; })}</div></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Automatisering</span><h2>Zelfstandig werken</h2></div></div><div className={styles.settingRows}><article><div><strong>Automatische onderzoekscyclus</strong><span>Hermes kiest en uitvoert zelfstandig de volgende veilige stap.</span></div><b className={heartbeatActive ? styles.okText : styles.warnText}>{heartbeatActive ? "Aan" : "Niet zichtbaar"}</b></article><article><div><strong>Volgende cyclus</strong><span>De geplande eerstvolgende automatische run.</span></div><b>{formatDate(heartbeat?.nextRun, true)}</b></article><article><div><strong>Laatste refresh</strong><span>Laatste keer dat deze browser de status heeft opgehaald.</span></div><b>{lastRefresh ? formatDate(lastRefresh.toISOString(), true) : "—"}</b></article></div></section>
      <section className={styles.settingsGroup}><div className={styles.sectionHead}><div><span>Veiligheid</span><h2>Grenzen die Hermes niet zelf mag passeren</h2></div></div><div className={styles.lockGrid}><span>Live orders <b>Uit</b></span><span>Brokerbinding <b>Menselijke toestemming</b></span><span>Risicolimieten <b>Beschermd</b></span><span>Productiepromotie <b>Beschermd</b></span></div></section>
      <section className={styles.advancedLinks}><div><span>Systeemstatus</span><h3>Diagnostiek en controles</h3><p>Voor storingen, deployments en technische verificatie.</p><Link href="/instellingen/systeem">Open systeemstatus →</Link></div><div><span>Geavanceerd</span><h3>Hermes ontwikkeling</h3><p>Brain Studio, capabilities en technische researchtools.</p><Link href="/instellingen/geavanceerd">Open geavanceerd →</Link></div></section>
      <details className={styles.techSummary}><summary>Ruwe technische status</summary><pre>{JSON.stringify({ health, brain, heartbeat, quality, git }, null, 2)}</pre></details>
    </>;
  }

  return <div className={styles.shell}>
    <Header />
    <main className={styles.main}>{page === "overzicht" ? <Overview /> : page === "onderzoek" ? <Research /> : page === "trading" ? <Trading /> : <Settings />}</main>
    <button className={styles.chatFab} onClick={() => setChatOpen(true)}><span>H</span><div><strong>Praat met Hermes</strong><small>{chatBusy ? "Hermes werkt…" : "Vraag iets in gewone taal"}</small></div></button>
    {chatOpen && <div className={styles.drawerBackdrop} onMouseDown={() => setChatOpen(false)}><aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}><header><div><span>Onderzoeksomgeving</span><h2>Praat met Hermes</h2><p>Gewone vragen. Geen technische commando's nodig.</p></div><button onClick={() => setChatOpen(false)}>×</button></header><div className={styles.chatThread}>{chatMessages.map((message, index) => <article key={index} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}><strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong><p>{message.text}</p></article>)}{chatBusy && <article className={styles.hermes}><strong>Hermes</strong><p>Ik ben aan het werk…</p></article>}</div><form onSubmit={askHermes} className={styles.chatForm}><textarea rows={4} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Bijvoorbeeld: wat heb je vandaag geleerd?" /><div><small>Research only · live trading blijft geblokkeerd</small><button disabled={chatBusy || !chatInput.trim()}>{chatBusy ? "Bezig…" : "Verstuur"}</button></div></form></aside></div>}
  </div>;
}
