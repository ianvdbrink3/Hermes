"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { activeFixture, buildFixtureCards, latestPassedFixture, type FixtureReviewFeed, type FixtureReviewItem } from "@/lib/os/fixture-review";
import { requestResearchSnapshotRefresh, subscribeResearchSnapshotRefresh } from "@/lib/os/research-snapshot-refresh";
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
  fixtureReview?: FixtureReviewFeed;
  sourceSnapshot?: RecordLike;
  lastReview?: RecordLike | null;
  events?: RecordLike[];
};

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

function queueClass(item: FixtureReviewItem) {
  if (item.tone === "positive") return styles.queuePositive;
  if (item.tone === "warning") return styles.queueWarning;
  if (item.tone === "attention") return styles.queueAttention;
  if (item.tone === "negative") return styles.queueNegative;
  if (item.tone === "muted") return styles.queueMuted;
  return styles.queueNeutral;
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
    const unsubscribe = subscribeResearchSnapshotRefresh(() => void refresh());
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [refresh]);

  const cards = useMemo(() => buildFixtureCards(snapshot || {}), [snapshot]);
  const current = useMemo(() => activeFixture(cards), [cards]);
  const lastPass = useMemo(() => latestPassedFixture(cards), [cards]);
  const currentFixture = current?.fixtureId || "—";
  const reviewCards = cards.filter((item) => ["PASS", "INCONCLUSIVE", "REJECT"].includes(item.status)).reverse().slice(0, 6);
  const queue = current ? cards.filter((item) => item.number >= current.number && item.status !== "PASS").slice(0, 5) : [];

  return (
    <section className={styles.shell} aria-label="Live researchactiviteit">
      <div className={styles.heading}>
        <div>
          <span>LIVE RESEARCHFEED</span>
          <h2>Wat Hermes nu doet en hierna pakt</h2>
        </div>
        <button onClick={requestResearchSnapshotRefresh}>Ververs live state</button>
      </div>

      <div className={styles.summary}>
        <article>
          <span>Actieve review</span>
          <strong>{currentFixture}</strong>
          <small>{current?.label || "NIET IN FEED"}</small>
        </article>
        <article>
          <span>Laatste bewezen resultaat</span>
          <strong>{lastPass ? `${lastPass.fixtureId} ✓ PASS` : "—"}</strong>
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

          <article className={`${styles.activeReview} ${current ? queueClass(current) : styles.queueUnknown}`}>
            <div>
              <span>{current?.label || "NIET IN FEED"}</span>
              <strong>{current ? `${currentFixture} — huidige bounded semantic review` : "Geen autoritatieve actuele fixture"}</strong>
              {current?.status === "WAIT_RETRY_WINDOW" ? <p>
                {current.sameTaskStartsUsed !== null && current.sameTaskStartsLimit !== null ? `${current.sameTaskStartsUsed}/${current.sameTaskStartsLimit} starts gebruikt · ` : ""}
                Volgende poging: {formatDate(current.earliestRetryAt)} · {current.semanticVerdict === "PASS" ? "Semantisch PASS" : "Geen semantisch PASS"} · {current.schedulerActive === true ? "Scheduler actief" : current.schedulerActive === false ? "Scheduler niet actief" : "Schedulerstatus onbekend"}
              </p> : <p>{compact(snapshot?.mission?.objective || snapshot?.mission?.inProgress || snapshot?.runtime?.reason, 240)}</p>}
            </div>
            <b>{current?.label || "NIET IN FEED"}</b>
          </article>

          <div className={styles.reviewList}>
            {reviewCards.length ? reviewCards.map((item) => (
              <article key={`${item.fixtureId}-${item.status}`} className={queueClass(item)}>
                <div>
                  <span>{item.label}</span>
                  <strong>{item.fixtureId} — semantic review</strong>
                  <p>{item.semanticVerdict ? `Semantisch verdict: ${item.semanticVerdict}` : "Geen semantisch verdict in de fixturefeed."}</p>
                </div>
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
            {queue.length ? queue.map((item) => {
              return (
                <article key={item.fixtureId} className={queueClass(item)}>
                  <code>{item.fixtureId}</code>
                  <div>
                    <strong>{item === current ? "Huidige bounded review" : item.status === "NEXT" ? "Eerstvolgende fixture-review" : "Latere fixture-review"}</strong>
                    <p>{item === current
                      ? compact(snapshot?.mission?.next || snapshot?.runtime?.reason, 200)
                      : `Autoritatieve status: ${item.label}.`}</p>
                  </div>
                  <span>{item.label}</span>
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
