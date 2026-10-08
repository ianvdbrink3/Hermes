"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HermesShell, type HermesTone } from "./hermes-shell";
import { ownerActionKnown } from "@/lib/os/presentation";
import { ShadowOverview } from "./shadow-overview";
import styles from "./simple-hermes.module.css";

type Page = "overzicht" | "trading" | "instellingen";
type RecordLike = Record<string, unknown>;

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
  provider?: {
    name?: string;
    model?: string;
    state?: string;
    retryNotBeforeUtc?: string | null;
    cooldownActive?: boolean;
  };
  scheduler?: {
    found?: boolean;
    active?: boolean;
    name?: string | null;
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
  };
  safety?: RecordLike;
  connections?: {
    production?: { configured?: boolean; state?: string };
    research?: { configured?: boolean; state?: string };
    builder?: { configured?: boolean; state?: string };
  };
  telemetry?: {
    stateFeed?: boolean;
    scheduler?: boolean;
    compute?: boolean;
    exactProviderCooldown?: boolean;
    runtimeEvents?: boolean;
  };
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

function short(value: unknown, max = 190) {
  const text = clean(value);
  if (!text) return "—";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function formatDate(value: unknown, withDate = false) {
  if (!value) return "—";
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  if (Number.isNaN(date.getTime())) return rawText(value);
  return new Intl.DateTimeFormat(
    "nl-NL",
    withDate
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("nl-NL").format(value);
}

function ratio(value: number | null | undefined, max: number | null | undefined) {
  if (value === null || value === undefined || max === null || max === undefined) return "—";
  return formatNumber(value) + " / " + formatNumber(max);
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
    READY: "Klaar",
    RUNNING: "Onderzoek actief",
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

function connectionLabel(state?: string) {
  if (state === "connected") return "Verbonden";
  if (state === "degraded") return "Beperkt";
  if (state === "not_configured") return "Niet ingesteld";
  if (state === "auth_error") return "Authenticatie mislukt";
  if (state === "offline") return "Offline";
  return "Onbekend";
}

function eventTitle(item: RecordLike) {
  return short(item.title || item.event || item.type || item.state || "Runtime-event", 120);
}

function eventBody(item: RecordLike) {
  return short(item.message || item.reason || item.result || item.detail || item.status, 170);
}

function missionTitle(snapshot: Snapshot | null) {
  return snapshot?.mission?.fixture || short(snapshot?.mission?.taskId, 44) || "Geen actieve mission";
}

function runtimeMessage(snapshot: Snapshot | null) {
  const state = snapshot?.runtime?.state;
  if (state === "RUNNING") return "Hermes voert nu gecontroleerd researchwerk uit.";
  if (state === "WAITING_PROVIDER") return "Hermes wacht veilig op nieuwe modelcapaciteit.";
  if (state === "WAITING_BUDGET") return "Hermes wacht tot compute weer beschikbaar is.";
  if (state === "NEEDS_HUMAN") return "Een menselijke beslissing blokkeert de volgende stap.";
  if (state === "BLOCKED_INTEGRITY") return "Een integriteitscontrole blokkeert verdere progressie.";
  if (state === "OFFLINE") return "De runtime is momenteel niet bereikbaar.";
  return snapshot?.runtime?.reason || "Hermes bewaakt de huidige researchstate en gaat alleen verder binnen de ingestelde grenzen.";
}

export function SimpleHermes({ page }: { page: Page }) {
  const requestSequence = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const next = (await response.json()) as Snapshot;
      if (sequence !== requestSequence.current) return;
      setSnapshot(next);
      setLastRefresh(new Date());
    } catch {
      if (sequence !== requestSequence.current) return;
      setSnapshot({ runtime: { state: "OFFLINE", reason: "De centrale OS-state kon niet worden geladen." } });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
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
      requestSequence.current++;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const source = record(snapshot?.sourceSnapshot);
  const events = (snapshot?.events || []).slice(0, 6);
  const decisions = rows(source.decisions).slice(0, 5);
  const actionKnown = ownerActionKnown(snapshot);
  const needsYou = !clearHumanGate(snapshot?.mission?.needsHuman);
  const tone = stateTone(snapshot?.runtime?.state);
  const status = stateLabel(snapshot?.runtime?.state);
  const compute = snapshot?.compute;

  const providerState = useMemo(() => {
    if (snapshot?.provider?.cooldownActive) {
      return {
        label: "Cooldown",
        detail: snapshot.provider.retryNotBeforeUtc
          ? "Retry na " + formatDate(snapshot.provider.retryNotBeforeUtc, true)
          : "Retrytijd niet bevestigd",
        tone: "warn",
      };
    }
    if (snapshot?.provider?.state) {
      return { label: snapshot.provider.state, detail: snapshot.provider.model || "Model onbekend", tone: "neutral" };
    }
    return { label: "Onbekend", detail: "Geen providerstatus beschikbaar", tone: "neutral" };
  }, [snapshot]);

  function Overview() {
    return (
      <>
        <header className={styles.pageHeader}><span className={styles.eyebrow}>Jouw Hermes</span><h1>Wat gebeurt er vandaag?</h1><p>Volg de marktobservaties, bekijk wat Hermes onderzoekt en zie of jij iets moet doen.</p></header>
        {actionKnown && needsYou && <section className={styles.priorityAttention}><h2>Hermes heeft jouw hulp nodig</h2><p>{short(snapshot?.mission?.needsHuman, 300)}</p><Link href="/beslissingen">Bekijk jouw actie →</Link></section>}
        <ShadowOverview />
        <section className={styles.missionHero}>
          <div className={styles.missionTop}>
            <div>
              <span className={styles.eyebrow}>Ontwikkeling van Hermes</span>
              <div className={styles.stateLine}>
                <i className={styles["tone_" + tone]} />
                <strong>{status}</strong>
              </div>
            </div>
            <span className={styles.refreshStamp}>
              {lastRefresh ? "Bijgewerkt " + formatDate(lastRefresh.toISOString()) : "State laden…"}
            </span>
          </div>

          <div className={styles.missionCopy}>
            <h2>{status}</h2>
            <details><summary>Wat onderzoekt Hermes precies?</summary><p>{short(snapshot?.mission?.objective, 1000)}</p><small>{missionTitle(snapshot)}</small></details>
            <p>{runtimeMessage(snapshot)}</p>
          </div>

          <div className={styles.nextStep}>
            <span>Volgende stap</span>
            <strong>{short(snapshot?.mission?.next, 210)}</strong>
          </div>

          <div className={styles.heroActions}>
            <Link href="/onderzoek" className={styles.primaryButton}>Bekijk het onderzoek →</Link>
            <button className={styles.secondaryButton} onClick={() => window.dispatchEvent(new Event("hermes:open-chat"))}>Praat met Hermes</button>
          </div>
        </section>

        <details className={styles.rawState}><summary>Jouw acties en operationele details</summary><section className={styles.priorityGrid}>
          <article className={needsYou ? styles.priorityAttention : styles.priorityGood}>
            <div className={styles.cardLabel}>Jouw actie</div>
            <strong>{!actionKnown ? "Nog niet bevestigd" : needsYou ? "Beslissing nodig" : "Geen actie nodig"}</strong>
            <p>{!actionKnown ? "De actuele actie-status is niet beschikbaar." : needsYou ? short(snapshot?.mission?.needsHuman, 160) : "Hermes kan binnen de ingestelde grenzen zelfstandig verder."}</p>
            {needsYou ? <Link href="/beslissingen">Open beslissing →</Link> : null}
          </article>

          <article>
            <div className={styles.cardLabel}>Provider</div>
            <strong>{providerState.label}</strong>
            <p>{providerState.detail}</p>
          </article>

          <article>
            <div className={styles.cardLabel}>Compute · 24 uur</div>
            <strong>{compute?.available ? ratio(compute.runs24h, compute.maxRuns24h) : "Niet beschikbaar"}</strong>
            <p>{compute?.available ? ratio(compute.totalTokens24h, compute.maxTotalTokens24h) + " tokens" : "Compute-telemetrie ontbreekt in de statefeed."}</p>
          </article>

          <article>
            <div className={styles.cardLabel}>Safety</div>
            <strong className={styles.locked}>Execution locked</strong>
            <p>Paper en live execution blijven buiten browsercontrole.</p>
          </article>
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.panel}>
            <header className={styles.panelHead}>
              <div><span>Nu</span><h2>Researchstatus</h2></div>
              <Link href="/onderzoek">Open volledig →</Link>
            </header>
            <dl className={styles.statusRows}>
              <div><dt>Huidig werk</dt><dd>{missionTitle(snapshot)}</dd></div>
              <div><dt>In uitvoering</dt><dd>{short(snapshot?.mission?.inProgress, 220)}</dd></div>
              <div><dt>Blokkades</dt><dd>{short(snapshot?.mission?.blockers, 220)}</dd></div>
              <div><dt>Laatste werk</dt><dd>{short(snapshot?.mission?.lastCompletedWork, 220)}</dd></div>
            </dl>
          </div>

          <div className={styles.panel}>
            <header className={styles.panelHead}>
              <div><span>Runtime</span><h2>Systeemgezondheid</h2></div>
              <Link href="/instellingen/systeem">Diagnostiek →</Link>
            </header>
            <div className={styles.healthRows}>
              <div><span>Statefeed</span><b>{snapshot?.telemetry?.stateFeed ? "Online" : "Niet bevestigd"}</b></div>
              <div><span>Scheduler</span><b>{snapshot?.scheduler?.active === true ? "Actief" : snapshot?.scheduler?.active === false ? "Niet actief" : "Onbekend"}</b></div>
              <div><span>Gereserveerde runs</span><b>{formatNumber(compute?.openReservations)}</b></div>
              <div><span>Omgeving</span><b>{snapshot?.deployment?.environment || "—"}</b></div>
            </div>
          </div>
        </section>

        </details>
        <section className={styles.activitySection}>
          <header className={styles.panelHead}>
            <div><span>Timeline</span><h2>Recente activiteit</h2></div>
          </header>
          <div className={styles.timeline}>
            {events.length ? events.map((item, index) => (
              <article key={index}>
                <i />
                <div>
                  <strong>{eventTitle(item)}</strong>
                  <p>{eventBody(item)}</p>
                </div>
                <time>{formatDate(item.timestamp || item.ts, true)}</time>
              </article>
            )) : (
              <div className={styles.empty}>Nog geen runtime-events in de actuele statefeed.</div>
            )}
          </div>
        </section>
      </>
    );
  }

  function Trading() {
    const production = snapshot?.connections?.production;
    return (
      <>
        <section className={styles.pageHeader}>
          <span className={styles.eyebrow}>Trading</span>
          <h1>Execution blijft dicht tot de infrastructuur er klaar voor is.</h1>
          <p>Deze pagina toont alleen geverifieerde readiness. Er worden geen demo-posities, prijzen of fictieve portfolio-data weergegeven.</p>
        </section>

        <section className={styles.readinessPanel}>
          <div className={styles.readinessTitle}>
            <div>
              <span>Live execution</span>
              <strong className={styles.locked}>LOCKED</strong>
            </div>
            <p>Browsergestuurde orderactivatie blijft hard uitgeschakeld.</p>
          </div>
          <div className={styles.checklist}>
            <div><i className={styles.checkGood}>✓</i><span><strong>Research runtime</strong><small>Onderzoek en validatie kunnen draaien zonder execution.</small></span></div>
            <div><i className={styles.checkGood}>✓</i><span><strong>Safety boundary</strong><small>De OS kan geen live kapitaal activeren.</small></span></div>
            <div><i className={production?.state === "connected" ? styles.checkGood : styles.checkMuted}>{production?.state === "connected" ? "✓" : "○"}</i><span><strong>Production gateway</strong><small>{connectionLabel(production?.state)}</small></span></div>
            <div><i className={styles.checkMuted}>○</i><span><strong>Broker integration</strong><small>Niet vanuit deze browser geactiveerd.</small></span></div>
            <div><i className={styles.checkMuted}>○</i><span><strong>Paper approval</strong><small>Expliciete menselijke toestemming vereist.</small></span></div>
            <div><i className={styles.checkMuted}>○</i><span><strong>Live approval</strong><small>Expliciete menselijke toestemming vereist.</small></span></div>
          </div>
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.panel}>
            <header className={styles.panelHead}><div><span>Wat Hermes kan</span><h2>Research</h2></div></header>
            <ul className={styles.simpleList}>
              <li>Hypotheses en strategieën onderzoeken</li>
              <li>Historische tests en robuustheidschecks beoordelen</li>
              <li>Risico's, failure modes en evidence analyseren</li>
            </ul>
          </div>
          <div className={styles.panel}>
            <header className={styles.panelHead}><div><span>Niet geautoriseerd</span><h2>Execution</h2></div></header>
            <ul className={styles.simpleList}>
              <li>Geen browsergestuurde live orders</li>
              <li>Geen zelfstandige brokerbinding</li>
              <li>Geen versoepeling van risicolimieten</li>
            </ul>
          </div>
        </section>
      </>
    );
  }

  function Settings() {
    const profiles = [
      { label: "Stabiele omgeving", item: snapshot?.connections?.production },
      { label: "Onderzoeksomgeving", item: snapshot?.connections?.research },
      { label: "Ontwikkelomgeving", item: snapshot?.connections?.builder },
    ];

    return (
      <>
        <section className={styles.pageHeader}>
          <span className={styles.eyebrow}>Instellingen</span>
          <h1>Instellingen en hulpmiddelen</h1>
          <p>Controleer verbindingen en automatische taken. Voor vragen over de werking kies je Systeemstatus; voor onderzoek naar verbeteringen kies je Hermes verbeteren.</p>
        </section>

        <section className={styles.settingsGrid}>
          <div className={styles.panel}>
            <header className={styles.panelHead}>
              <div><span>Verbindingen</span><h2>Hermes-profielen</h2></div>
              <button onClick={() => void refresh()} disabled={loading}>{loading ? "Controleren…" : "Ververs"}</button>
            </header>
            <div className={styles.connectionRows}>
              {profiles.map(({ label, item }) => (
                <article key={label}>
                  <div><strong>{label}</strong><span>{connectionLabel(item?.state)}</span></div>
                  <b>{item?.configured === true ? "Ingesteld" : item?.configured === false ? "Niet ingesteld" : "Onbekend"}</b>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.panel}>
            <header className={styles.panelHead}><div><span>Automatisering</span><h2>Automatisch onderzoek</h2></div></header>
            <dl className={styles.statusRows}>
              <div><dt>Status</dt><dd>{snapshot?.scheduler?.active === true ? "Actief" : snapshot?.scheduler?.active === false ? "Niet actief" : "Onbekend"}</dd></div>
              <div><dt>Volgende tick</dt><dd>{formatDate(snapshot?.scheduler?.nextRun, true)}</dd></div>
              <div><dt>Laatste status</dt><dd>{short(snapshot?.scheduler?.lastStatus, 150)}</dd></div>
            </dl>
          </div>

          <Link href="/instellingen/systeem" className={styles.toolCard}>
            <span>Systeemstatus</span>
            <strong>Controleer de werking</strong>
            <p>Gateways, scheduler, deployment, security en operationele checks.</p>
            <b>Open →</b>
          </Link>

          <Link href="/instellingen/geavanceerd" className={styles.toolCard}>
            <span>Lab</span>
            <strong>Hermes verbeteren</strong>
            <p>Onderzoek vaardigheden, bespreek zwakke plekken en start een verbeteronderzoek.</p>
            <b>Open →</b>
          </Link>
        </section>

        <details className={styles.rawState}>
          <summary>Technische OS-state</summary>
          <pre>{JSON.stringify({ snapshot, decisions }, null, 2)}</pre>
        </details>
      </>
    );
  }

  const active = page === "trading" ? "trading" : page === "instellingen" ? "instellingen" : "overzicht";
  return (
    <HermesShell
      active={active}
      status={status}
      statusTone={tone}
      actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Laden…" : "Ververs"}</button>}
    >
      {page === "overzicht" ? Overview() : page === "trading" ? Trading() : Settings()}
    </HermesShell>
  );
}
