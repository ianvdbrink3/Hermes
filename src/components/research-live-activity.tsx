"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./research-live-activity.module.css";

type RecordLike = Record<string, unknown>;

type Snapshot = {
  runtime?: { state?: string; reason?: string | null };
  mission?: {
    fixture?: string | null;
    fixtureNumber?: number | null;
    nextFixture?: string | null;
    taskId?: string | null;
    objective?: unknown;
    inProgress?: unknown;
    next?: unknown;
    lastCompletedWork?: unknown;
  };
  scheduler?: { active?: boolean; nextRun?: unknown };
  sourceSnapshot?: RecordLike;
  lastReview?: RecordLike | null;
  events?: RecordLike[];
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
  if (Array.isArray(value)) return value.map(String).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compact(value: unknown, max = 180) {
  const source = text(value, "").replace(/\s+/g, " ").trim();
  if (!source) return "—";
  return source.length > max ? `${source.slice(0, max - 1)}…` : source;
}

function fixtureNumber(value: unknown) {
  const match = text(value, "").match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function outcome(item: RecordLike) {
  return text(
    item.verdict ??
      item.outcome ??
      item.semantic_outcome ??
      item.semanticOutcome ??
      item.overall_outcome ??
      item.overallOutcome,
    "",
  ).toUpperCase();
}

function fixtureFromItem(item: RecordLike) {
  const source = [
    item.fixture,
    item.fixture_id,
    item.task_id,
    item.taskId,
    item.experiment_id,
    item.hypothesis,
    item.result,
    item.title,
    item.message,
  ]
    .map((value) => text(value, ""))
    .join(" ");
  const match = source.match(/FS-I(\d+)/i);
  return match ? `FS-I${Number(match[1])}` : null;
}

function acceptedReviews(snapshot: Snapshot | null) {
  if (!snapshot) return [] as RecordLike[];
  const source = record(snapshot.sourceSnapshot);
  const experiments = record(source.experiments);
  const runtime = record(source.runtime);
  const candidates = [
    ...rows(experiments.recent || experiments.entries),
    ...rows(source.reviews || runtime.reviews),
    ...(snapshot.events || []),
  ];
  if (snapshot.lastReview) candidates.unshift(snapshot.lastReview);

  const seen = new Set<string>();
  const result: RecordLike[] = [];

  for (const item of candidates) {
    const fixture = fixtureFromItem(item);
    const verdict = outcome(item);
    if (!fixture || !["PASS", "FAIL", "INCONCLUSIVE"].includes(verdict)) continue;
    const key = `${fixture}:${verdict}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, fixture, verdict });
  }

  return result.slice(0, 8);
}

function stateLabel(state?: string) {
  if (state === "RUNNING") return "WORDT BEOORDEELD";
  if (state === "WAITING_SPACING") return "WACHT OP SPACING";
  if (state === "WAITING_BUDGET") return "WACHT OP BUDGET";
  if (state === "WAITING_PROVIDER" || state === "WAITING_PROVIDER_UNVERIFIED") return "WACHT OP PROVIDER";
  if (state === "READY") return "KLAAR";
  if (state === "NEEDS_HUMAN") return "MENSELIJKE ACTIE";
  return state || "ONBEKEND";
}

export function ResearchLiveActivity() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) return;
      setSnapshot((await response.json()) as Snapshot);
      setLoadedAt(new Date());
    } catch {
      // The primary Research Control Center remains responsible for offline state.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const reviews = useMemo(() => acceptedReviews(snapshot), [snapshot]);
  const currentNo = snapshot?.mission?.fixtureNumber || fixtureNumber(snapshot?.mission?.fixture);
  const currentFixture = currentNo ? `FS-I${currentNo}` : snapshot?.mission?.fixture || "—";
  const lastPass = reviews.find((item) => outcome(item) === "PASS");
  const queue = currentNo
    ? Array.from({ length: Math.min(5, 31 - currentNo) }, (_, index) => currentNo + index)
    : [];

  return (
    <section className={styles.shell} aria-label="Live researchactiviteit">
      <div className={styles.heading}>
        <div>
          <span>LIVE RESEARCHFEED</span>
          <h2>Wat Hermes nu doet en hierna pakt</h2>
        </div>
        <button onClick={() => void refresh()}>Ververs live state</button>
      </div>

      <div className={styles.summary}>
        <article>
          <span>Actieve review</span>
          <strong>{currentFixture}</strong>
          <small>{stateLabel(snapshot?.runtime?.state)}</small>
        </article>
        <article>
          <span>Laatste bewezen resultaat</span>
          <strong>{lastPass ? `${text(lastPass.fixture)} ✓ PASS` : "—"}</strong>
          <small>{compact(snapshot?.mission?.lastCompletedWork, 90)}</small>
        </article>
        <article>
          <span>Router</span>
          <strong>{snapshot?.scheduler?.active ? "AUTONOOM ACTIEF" : "NIET ACTIEF"}</strong>
          <small>{snapshot?.runtime?.reason || "Geen aparte wachtreden."}</small>
        </article>
        <article>
          <span>Volgende schedulercheck</span>
          <strong>{formatDate(snapshot?.scheduler?.nextRun)}</strong>
          <small>{loadedAt ? `OS ververst ${formatDate(loadedAt.toISOString())}` : "laden…"}</small>
        </article>
      </div>

      <div className={styles.columns}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span>ACTUELE REVIEWSTATUS</span><h3>Recente reviews</h3></div>
            <small>runtime + inhoudelijke state</small>
          </div>

          <article className={styles.activeReview}>
            <div>
              <span>{stateLabel(snapshot?.runtime?.state)}</span>
              <strong>{currentFixture} — huidige bounded semantic review</strong>
              <p>{compact(snapshot?.mission?.objective || snapshot?.mission?.inProgress || snapshot?.runtime?.reason, 240)}</p>
            </div>
            <b>HUIDIG</b>
          </article>

          <div className={styles.reviewList}>
            {reviews.length ? reviews.slice(0, 6).map((item, index) => (
              <article key={`${text(item.fixture)}-${outcome(item)}-${index}`}>
                <div>
                  <span>{outcome(item)}</span>
                  <strong>{text(item.fixture)} — {compact(item.hypothesis || item.title || item.experiment_id || "semantic review", 120)}</strong>
                  <p>{compact(item.result || item.reason || item.message, 220)}</p>
                </div>
                <time>{formatDate(item.timestamp || item.created_at || item.ts)}</time>
              </article>
            )) : <div className={styles.empty}>Nog geen geverifieerde reviewhistorie in de statefeed.</div>}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span>AUTONOME WACHTRIJ</span><h3>Volgende veilige taken</h3></div>
            <small>alleen lineaire FS-reviewprogressie</small>
          </div>

          <div className={styles.queue}>
            {queue.length ? queue.map((number, index) => {
              const fixture = `FS-I${number}`;
              const status = index === 0 ? stateLabel(snapshot?.runtime?.state) : index === 1 ? "HIERNA BIJ PASS" : "QUEUED";
              return (
                <article key={fixture} className={index === 0 ? styles.currentQueue : undefined}>
                  <code>{fixture}</code>
                  <div>
                    <strong>{index === 0 ? "Huidige bounded review" : "Volgende fixture-review"}</strong>
                    <p>{index === 0
                      ? compact(snapshot?.mission?.next || snapshot?.runtime?.reason, 200)
                      : `Wordt pas geselecteerd nadat ${`FS-I${number - 1}`} aantoonbaar PASS is.`}</p>
                  </div>
                  <span>{status}</span>
                </article>
              );
            }) : <div className={styles.empty}>De actuele fixture ontbreekt nog in de statefeed.</div>}
          </div>

          <div className={styles.note}>
            Deze wachtrij is read-only. De OS start niets zelf en schuift nooit door zonder een bewezen PASS van de vorige fixture.
          </div>
        </div>
      </div>
    </section>
  );
}
