"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HermesShell, type HermesTone } from "@/components/hermes-shell";
import styles from "./beslissingen.module.css";

type RecordLike = Record<string, unknown>;

type Snapshot = {
  runtime?: { state?: string };
  mission?: {
    needsHuman?: unknown;
    blockers?: unknown;
    objective?: unknown;
    next?: unknown;
    lastCompletedWork?: unknown;
  };
  sourceSnapshot?: RecordLike;
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

function clean(value: unknown) {
  return text(value, "").replace(/\s+/g, " ").trim();
}

function clearHumanGate(value: unknown) {
  const normalized = clean(value).toLowerCase().replace(/[.!?;:,]+$/g, "").trim();
  return !normalized || ["none", "nothing", "geen", "n/a", "null", "no human gate", "no human action", "nothing required", "geen actie nodig"].includes(normalized);
}

function tone(state?: string): HermesTone {
  if (state === "READY" || state === "RUNNING") return "good";
  if (state === "NEEDS_HUMAN" || state === "BLOCKED_INTEGRITY" || state === "OFFLINE") return "bad";
  if (state) return "warn";
  return "muted";
}

export default function BeslissingenPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/os/snapshot", { cache: "no-store" });
      if (!response.ok) throw new Error("snapshot");
      setSnapshot((await response.json()) as Snapshot);
    } catch {
      setSnapshot({ runtime: { state: "OFFLINE" } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const source = record(snapshot?.sourceSnapshot);
  const history = useMemo(() => rows(source.decisions).slice(0, 12), [source]);
  const needsHuman = !clearHumanGate(snapshot?.mission?.needsHuman);
  const state = snapshot?.runtime?.state;

  return (
    <HermesShell
      active="beslissingen"
      status={state || "Status laden…"}
      statusTone={tone(state)}
      actions={<button onClick={() => void refresh()} disabled={loading}>{loading ? "Laden…" : "Ververs"}</button>}
    >
      <section className={styles.header}>
        <span>Decision control</span>
        <h1>Alle menselijke grenzen op één plek.</h1>
        <p>Hermes mag zelfstandig onderzoeken, maar expliciete menselijke beslissingen blijven zichtbaar en gescheiden van technische runtime-events.</p>
      </section>

      <section className={styles.focusGrid}>
        <article className={needsHuman ? styles.open : styles.clear}>
          <span>Open beslissing</span>
          <strong>{needsHuman ? "Actie nodig" : "Geen open menselijke gate"}</strong>
          <p>{needsHuman ? text(snapshot?.mission?.needsHuman) : "Hermes rapporteert momenteel geen menselijke blokkade."}</p>
        </article>
        <article>
          <span>Waarom</span>
          <strong>{needsHuman ? "Deze stap kan niet autonoom verder" : "Geen blokkade"}</strong>
          <p>{text(snapshot?.mission?.blockers)}</p>
        </article>
      </section>

      <section className={styles.panel}>
        <header><div><span>Context</span><h2>Huidige mission</h2></div></header>
        <dl>
          <div><dt>Objective</dt><dd>{text(snapshot?.mission?.objective)}</dd></div>
          <div><dt>Next</dt><dd>{text(snapshot?.mission?.next)}</dd></div>
          <div><dt>Laatste werk</dt><dd>{text(snapshot?.mission?.lastCompletedWork)}</dd></div>
        </dl>
      </section>

      <section className={styles.history}>
        <header><div><span>Historie</span><h2>Vastgelegde beslissingen</h2></div><small>{history.length} zichtbaar</small></header>
        <div>
          {history.length ? history.map((item, index) => (
            <article key={String(item.id || item.decision_id || index)}>
              <div>
                <strong>{text(item.title || item.decision || item.type || "Beslissing")}</strong>
                <p>{text(item.reason || item.summary || item.result || item.status)}</p>
              </div>
              <span>{text(item.status || item.verdict || "vastgelegd")}</span>
            </article>
          )) : <div className={styles.empty}>De actuele statefeed bevat nog geen afzonderlijke decision history.</div>}
        </div>
      </section>
    </HermesShell>
  );
}
