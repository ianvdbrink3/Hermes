// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./persistent-hermes-chat.module.css";

const STORAGE_KEY = "hermes-investment-os:owner-chat:v1";
const DEFAULT_SESSION = "simple-hermes-owner";
const WORKER_TERMINAL = new Set(["completed", "failed", "cancelled", "stopped"]);
const WORKER_FAILED = new Set(["failed", "cancelled", "stopped"]);
const MISSION_ACTIVE = new Set(["starting", "started", "running", "recovering", "continuing"]);
const MAX_AUTO_RECOVERY = 4;
const MAX_AUTO_CYCLES = 20;

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function welcome() {
  return {
    id: "welcome",
    role: "hermes",
    text: "Geef mij een vraag of onderzoeksmissie. Grote opdrachten worden als een duurzame missie behandeld: als een worker stopt, herstel ik vanuit de opgeslagen state en ga ik verder in een verse sessie.",
    createdAt: new Date().toISOString(),
  };
}

function freshConversation(sessionId = DEFAULT_SESSION) {
  return { version: 3, sessionId, messages: [welcome()] };
}

function loadConversation() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshConversation();
    const parsed = JSON.parse(raw);
    return {
      version: 3,
      sessionId: typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : DEFAULT_SESSION,
      messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : [welcome()],
    };
  } catch {
    return freshConversation();
  }
}

function saveConversation(conversation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...conversation,
      messages: conversation.messages.slice(-160),
    }));
  } catch {
    // De server-side Hermes-run blijft leidend; browseropslag is alleen de UX-laag.
  }
}

function time(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function duration(startedAt, now) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}u ${minutes % 60}m`;
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function missionIsActive(message) {
  return Boolean(message?.missionId && MISSION_ACTIVE.has(String(message.missionStatus || message.status || "").toLowerCase()));
}

function finalMarker(output) {
  const text = String(output || "");
  if (text.includes("MISSION_BLOCKED_HUMAN")) return "blocked_human";
  if (text.includes("MISSION_BLOCKED_SAFETY")) return "blocked_safety";
  if (text.includes("MISSION_CONTINUE")) return "continue";
  if (text.includes("MISSION_COMPLETE")) return "complete";
  return "complete";
}

function looksNonRetryable(reason) {
  const text = String(reason || "").toLowerCase();
  return [
    "not configured",
    "unauthorized",
    "forbidden",
    "invalid api key",
    "authentication",
    "credential required",
    "human gate",
    "safety boundary",
  ].some((needle) => text.includes(needle));
}

export function PersistentHermesChatV5() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [conversation, setConversation] = useState(() => freshConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(0);
  const threadRef = useRef(null);
  const launchingRef = useRef(new Set());

  useEffect(() => {
    setConversation(loadConversation());
    setNow(Date.now());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveConversation(conversation);
  }, [conversation, ready]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function intercept(event) {
      const element = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!element) return;
      const label = (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!label.includes("praat met hermes") && label !== "stel een vraag") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    }
    window.addEventListener("click", intercept, true);
    return () => window.removeEventListener("click", intercept, true);
  }, []);

  const activeMission = useMemo(
    () => conversation.messages.find((message) => missionIsActive(message)) || null,
    [conversation.messages],
  );
  const busy = sending || Boolean(activeMission);

  function patchMessage(messageId, patch) {
    setConversation((current) => ({
      ...current,
      messages: current.messages.map((message) => message.id === messageId ? { ...message, ...patch } : message),
    }));
  }

  async function readRun(runId) {
    const response = await fetch(`/api/brain/runs/${encodeURIComponent(runId)}?environment=research`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    return { response, result };
  }

  async function launchCycle({
    messageId,
    missionId,
    objective,
    attempt,
    mode,
    previousRunId,
    failureReason,
  }) {
    const launchKey = `${missionId}:${attempt}:${mode}`;
    if (launchingRef.current.has(launchKey)) return;
    launchingRef.current.add(launchKey);

    patchMessage(messageId, {
      missionStatus: mode === "recover" ? "recovering" : mode === "continue" ? "continuing" : "starting",
      status: mode === "recover" ? "recovering" : mode === "continue" ? "continuing" : "starting",
      runId: null,
      attempt,
      mode,
      updatedAt: new Date().toISOString(),
      text: mode === "recover"
        ? "Een worker stopte onverwacht. Hermes herstelt vanuit de laatste persistente state en start een verse, kleinere herstelcyclus."
        : mode === "continue"
          ? "De vorige cyclus is veilig afgerond. Hermes start zelfstandig de volgende begrensde cyclus van dezelfde missie."
          : "Hermes heeft deze opdracht als duurzame onderzoeksmissie gestart.",
    });

    try {
      const response = await fetch("/api/brain/mission/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mission_id: missionId,
          objective,
          attempt,
          mode,
          previous_run_id: previousRunId || undefined,
          failure_reason: failureReason || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error || !result.run_id) {
        throw new Error(result.error || `Herstelcyclus kon niet starten (HTTP ${response.status}).`);
      }
      patchMessage(messageId, {
        runId: result.run_id,
        status: String(result.status || "started").toLowerCase(),
        missionStatus: String(result.status || "started").toLowerCase(),
        currentRunStartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPollError: undefined,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "De nieuwe worker kon niet starten.";
      if (attempt < MAX_AUTO_RECOVERY && !looksNonRetryable(reason)) {
        patchMessage(messageId, {
          missionStatus: "recovering",
          status: "recovering",
          runId: null,
          failureReason: reason,
          nextAttempt: attempt + 1,
          previousRunId: previousRunId || null,
          updatedAt: new Date().toISOString(),
          text: "De herstelworker kon niet starten. De missie blijft actief en probeert automatisch opnieuw met een verse sessie.",
        });
      } else {
        patchMessage(messageId, {
          missionStatus: looksNonRetryable(reason) ? "blocked_human" : "paused_recovery",
          status: looksNonRetryable(reason) ? "blocked_human" : "paused_recovery",
          runId: null,
          failureReason: reason,
          updatedAt: new Date().toISOString(),
          text: looksNonRetryable(reason)
            ? "De missie heeft een echte toegangs- of menselijke blokkade gevonden. Andere veilige autonomie blijft ongewijzigd."
            : "De missie is niet mislukt, maar automatisch herstel is na meerdere verse workers gepauzeerd om een eindeloze retry-loop te voorkomen.",
        });
      }
    } finally {
      launchingRef.current.delete(launchKey);
    }
  }

  useEffect(() => {
    if (!ready) return;
    const pending = conversation.messages.find((message) =>
      message.missionId &&
      !message.runId &&
      ["recovering", "continuing"].includes(String(message.missionStatus || "").toLowerCase()) &&
      Number(message.nextAttempt || message.attempt || 1) <= MAX_AUTO_CYCLES
    );
    if (!pending) return;
    const attempt = Number(pending.nextAttempt || pending.attempt || 1);
    const mode = pending.missionStatus === "recovering" ? "recover" : "continue";
    const timer = window.setTimeout(() => {
      void launchCycle({
        messageId: pending.id,
        missionId: pending.missionId,
        objective: pending.objective,
        attempt,
        mode,
        previousRunId: pending.previousRunId,
        failureReason: pending.failureReason,
      });
    }, mode === "recover" ? 3500 : 1800);
    return () => window.clearTimeout(timer);
  }, [ready, conversation.messages]);

  useEffect(() => {
    if (!activeMission?.runId) return;
    const runId = activeMission.runId;
    const messageId = activeMission.id;
    let stopped = false;
    let timeout = null;

    async function poll() {
      try {
        const { response, result } = await readRun(runId);
        if (stopped) return;

        if (!response.ok) {
          patchMessage(messageId, {
            lastPollError: result.error || `Status tijdelijk niet bereikbaar (HTTP ${response.status}). De missie blijft actief.`,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const status = String(result.status || "unknown").toLowerCase();
          if (WORKER_TERMINAL.has(status)) {
            if (status === "completed") {
              const output = result.output || "Deze researchcyclus is afgerond.";
              const marker = finalMarker(output);
              if (marker === "continue") {
                const nextAttempt = Number(activeMission.attempt || 1) + 1;
                if (nextAttempt <= MAX_AUTO_CYCLES) {
                  patchMessage(messageId, {
                    runId: null,
                    status: "continuing",
                    missionStatus: "continuing",
                    text: output,
                    lastCycleOutput: output,
                    previousRunId: runId,
                    failureReason: undefined,
                    nextAttempt,
                    updatedAt: new Date().toISOString(),
                    lastPollError: undefined,
                  });
                } else {
                  patchMessage(messageId, {
                    runId: null,
                    status: "paused_recovery",
                    missionStatus: "paused_recovery",
                    text: `${output}\n\nDe OS-supervisor heeft ${MAX_AUTO_CYCLES} begrensde cycli uitgevoerd. De persistente Hermes autonomy-state blijft leidend; de volgende heartbeat kan veilig verdergaan.`,
                    updatedAt: new Date().toISOString(),
                  });
                }
                return;
              }
              if (marker === "blocked_human" || marker === "blocked_safety") {
                patchMessage(messageId, {
                  runId: null,
                  status: marker,
                  missionStatus: marker,
                  text: output,
                  updatedAt: new Date().toISOString(),
                  lastPollError: undefined,
                });
                return;
              }
              patchMessage(messageId, {
                runId: null,
                status: "completed",
                missionStatus: "completed",
                text: output,
                updatedAt: new Date().toISOString(),
                lastPollError: undefined,
              });
              return;
            }

            const reason = result.error || result.output || `Worker eindigde met status ${status}.`;
            const attempt = Number(activeMission.attempt || 1);
            const failures = [
              ...(Array.isArray(activeMission.workerFailures) ? activeMission.workerFailures : []),
              { runId, status, reason, at: new Date().toISOString(), attempt },
            ].slice(-12);

            if (!looksNonRetryable(reason) && attempt < MAX_AUTO_RECOVERY) {
              patchMessage(messageId, {
                runId: null,
                status: "recovering",
                missionStatus: "recovering",
                workerFailures: failures,
                previousRunId: runId,
                failureReason: reason,
                nextAttempt: attempt + 1,
                text: "Een onderliggende research-worker stopte. De missie blijft actief: Hermes controleert de laatste checkpoint/state en hervat automatisch in een verse sessie.",
                updatedAt: new Date().toISOString(),
                lastPollError: undefined,
              });
            } else {
              patchMessage(messageId, {
                runId: null,
                status: looksNonRetryable(reason) ? "blocked_human" : "paused_recovery",
                missionStatus: looksNonRetryable(reason) ? "blocked_human" : "paused_recovery",
                workerFailures: failures,
                failureReason: reason,
                text: looksNonRetryable(reason)
                  ? "Hermes heeft een echte toegangs-, human- of safety-boundary gevonden. De missie is geblokkeerd, niet technisch mislukt."
                  : "Meerdere verse workers stopten achter elkaar. De missie is niet verloren: state en checkpoints blijven bewaard, maar automatisch herstel is gepauzeerd om een retry-loop te voorkomen.",
                updatedAt: new Date().toISOString(),
                lastPollError: undefined,
              });
            }
            return;
          }

          patchMessage(messageId, {
            status,
            missionStatus: status === "unknown" ? "running" : status,
            updatedAt: new Date().toISOString(),
            lastPollError: undefined,
          });
        }
      } catch {
        if (!stopped) {
          patchMessage(messageId, {
            lastPollError: "De laatste statuscontrole lukte niet. De worker blijft als actief beschouwd en het OS probeert opnieuw; dit is geen mission-failure.",
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (!stopped) timeout = window.setTimeout(poll, 4000);
    }

    poll();
    return () => {
      stopped = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [activeMission?.id, activeMission?.runId]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [open, conversation.messages.length, activeMission?.status]);

  async function startMission(objective) {
    const clean = objective.trim();
    if (!clean || busy) return;
    const missionId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const messageId = makeId("mission");
    const startedAt = new Date().toISOString();

    setConversation((current) => ({
      ...current,
      messages: [
        ...current.messages,
        { id: makeId("user"), role: "user", text: clean, createdAt: startedAt },
        {
          id: messageId,
          role: "hermes",
          text: "Hermes maakt hiervan een duurzame missie en start de eerste begrensde researchcyclus.",
          createdAt: startedAt,
          updatedAt: startedAt,
          missionId,
          objective: clean,
          missionStatus: "starting",
          status: "starting",
          attempt: 1,
          nextAttempt: 1,
          startedAt,
          workerFailures: [],
        },
      ],
    }));
    setInput("");
    setSending(true);
    try {
      await launchCycle({ messageId, missionId, objective: clean, attempt: 1, mode: "start" });
    } finally {
      setSending(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await startMission(input);
  }

  async function resumeRecovery(message) {
    if (!message?.missionId || busy) return;
    const attempt = Number(message.attempt || 1) + 1;
    patchMessage(message.id, {
      missionStatus: "recovering",
      status: "recovering",
      nextAttempt: attempt,
      updatedAt: new Date().toISOString(),
    });
  }

  function newConversation() {
    if (activeMission) return;
    if (!window.confirm("Nieuw gesprek starten? Het huidige gesprek wordt uit deze browser verwijderd.")) return;
    setConversation(freshConversation(`simple-hermes-owner-${Date.now()}`));
    setInput("");
  }

  const activeLabel = activeMission?.missionStatus === "recovering" ? "Hermes herstelt zichzelf" : activeMission?.missionStatus === "continuing" ? "Hermes gaat zelfstandig verder" : "Hermes werkt aan missie";

  return <>
    {activeMission && !open && (
      <button className={styles.activePill} onClick={() => setOpen(true)}>
        <span className={styles.pulse} />
        <div><strong>{activeLabel}</strong><small>{duration(activeMission.startedAt, now)} actief · bekijk voortgang</small></div>
      </button>
    )}

    {open && (
      <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
        <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()} aria-label="Praat met Hermes">
          <header className={styles.header}>
            <div>
              <span>Onderzoeksomgeving</span>
              <h2>Praat met Hermes</h2>
              <p>Opdrachten zijn duurzame missies. Worker-fouten worden hersteld vanuit persistente state en checkpoints.</p>
            </div>
            <div className={styles.headerActions}>
              <button onClick={newConversation} disabled={Boolean(activeMission)}>Nieuw gesprek</button>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
          </header>

          {activeMission && (
            <section className={styles.runBanner}>
              <div className={styles.runBannerTop}><span className={styles.pulse} /><strong>{activeLabel}</strong><b>{duration(activeMission.startedAt, now)}</b></div>
              <p>De missie blijft leidend als een onderliggende worker stopt. Hermes hervat vanuit de laatst bewezen state in een verse sessie.</p>
              <div className={styles.runMeta}><span>Cyclus/poging: {activeMission.attempt || 1}</span><span>Gestart: {time(activeMission.startedAt)}</span></div>
              {activeMission.lastPollError && <small>{activeMission.lastPollError}</small>}
            </section>
          )}

          <div className={styles.thread} ref={threadRef}>
            {conversation.messages.map((message) => {
              const missionStatus = String(message.missionStatus || "").toLowerCase();
              const failures = Array.isArray(message.workerFailures) ? message.workerFailures : [];
              const paused = missionStatus === "paused_recovery";
              const blocked = missionStatus === "blocked_human" || missionStatus === "blocked_safety";
              return (
                <article key={message.id} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}>
                  <div className={styles.messageHead}>
                    <strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong>
                    <time>{time(message.createdAt)}</time>
                  </div>
                  <p>{message.text}</p>

                  {message.missionId && missionIsActive(message) && (
                    <div className={styles.messageRunning}><span className={styles.pulse} />{missionStatus === "recovering" ? "Herstellen" : missionStatus === "continuing" ? "Volgende cyclus starten" : "Missie actief"} · {duration(message.startedAt, now)}</div>
                  )}
                  {message.missionId && missionStatus === "completed" && <div className={styles.done}>✓ Missie afgerond</div>}
                  {blocked && <div className={styles.failed}>{missionStatus === "blocked_human" ? "Jouw actie nodig" : "Geblokkeerd door safety-boundary"}</div>}

                  {failures.length > 0 && (
                    <details style={{marginTop:10,padding:10,border:"1px solid rgba(255,255,255,.08)",borderRadius:8,color:"#87949a"}}>
                      <summary style={{cursor:"pointer",fontSize:9,fontWeight:750}}>Technische herstelgeschiedenis · {failures.length} worker-stop{failures.length === 1 ? "" : "s"}</summary>
                      {failures.map((failure, index) => (
                        <div key={`${failure.runId}-${index}`} style={{marginTop:8,fontSize:9,lineHeight:1.5}}>
                          <strong>Poging {failure.attempt}</strong> · {failure.status}<br />
                          <span>{failure.reason}</span><br />
                          <span style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace"}}>Run: {failure.runId}</span>
                        </div>
                      ))}
                    </details>
                  )}

                  {paused && (
                    <div style={{marginTop:12,padding:12,border:"1px solid rgba(255,188,79,.25)",borderRadius:9,background:"rgba(255,188,79,.035)"}}>
                      <strong style={{display:"block",fontSize:9,textTransform:"uppercase",letterSpacing:".08em",color:"#ffc46b"}}>Missie veilig gepauzeerd</strong>
                      <p style={{marginTop:7}}>State en checkpoints blijven bewaard. Automatisch herstel stopte alleen om een oneindige technische retry-loop te voorkomen.</p>
                      {message.failureReason && <p style={{marginTop:7}}>Laatste reden: {message.failureReason}</p>}
                      <button type="button" onClick={() => resumeRecovery(message)} disabled={busy} style={{marginTop:9,border:0,background:"#c9ff35",color:"#080b0d",borderRadius:7,padding:"7px 9px",fontSize:9,fontWeight:850,cursor:"pointer"}}>Herstel opnieuw vanuit checkpoint</button>
                    </div>
                  )}
                </article>
              );
            })}
            {sending && <article className={styles.hermes}><strong>Hermes</strong><p>Missie wordt gestart…</p></article>}
          </div>

          <form className={styles.form} onSubmit={submit}>
            <textarea
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeMission ? "Wacht tot deze missie is afgerond of een echte human gate bereikt…" : "Bijvoorbeeld: bouw jezelf autonoom verder uit tot een betere investment machine."}
              disabled={busy}
            />
            <div className={styles.formBottom}>
              <div><small>Research only · geen live trading</small><small>Worker-failure ≠ mission-failure</small></div>
              <button disabled={busy || !input.trim()}>{sending ? "Starten…" : activeMission ? "Missie actief" : "Verstuur"}</button>
            </div>
          </form>
        </aside>
      </div>
    )}
  </>;
}
