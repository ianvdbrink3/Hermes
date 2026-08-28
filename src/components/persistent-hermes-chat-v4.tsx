// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./persistent-hermes-chat.module.css";

const STORAGE_KEY = "hermes-investment-os:owner-chat:v1";
const DEFAULT_SESSION = "simple-hermes-owner";
const TERMINAL = new Set(["completed", "failed", "cancelled", "stopped"]);
const FAILED = new Set(["failed", "cancelled", "stopped"]);

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function welcome() {
  return {
    id: "welcome",
    role: "hermes",
    text: "Je kunt mij hier iets vragen over mijn onderzoek, het systeem of mijn volgende stap. Lange opdrachten blijven op de server doorlopen als je dit venster sluit of de pagina ververst.",
    createdAt: new Date().toISOString(),
  };
}

function freshConversation(sessionId = DEFAULT_SESSION) {
  return { version: 2, sessionId, messages: [welcome()] };
}

function loadConversation() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshConversation();
    const parsed = JSON.parse(raw);
    return {
      version: 2,
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
      messages: conversation.messages.slice(-120),
    }));
  } catch {
    // Browseropslag is alleen de UX-laag; de Hermes-run zelf draait server-side.
  }
}

function isActive(message) {
  return Boolean(message?.runId && !TERMINAL.has(String(message.status || "unknown").toLowerCase()));
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

function previousUserPrompt(messages, messageId) {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index <= 0) return "";
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === "user") return String(messages[cursor].text || "");
  }
  return "";
}

export function PersistentHermesChatV4() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [conversation, setConversation] = useState(() => freshConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(0);
  const [diagnosing, setDiagnosing] = useState({});
  const threadRef = useRef(null);

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

  const running = useMemo(
    () => conversation.messages.find((message) => isActive(message)) || null,
    [conversation.messages],
  );
  const busy = sending || Boolean(running);

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

  async function diagnose(message) {
    if (!message?.runId || diagnosing[message.id]) return;
    setDiagnosing((current) => ({ ...current, [message.id]: true }));
    try {
      const { response, result } = await readRun(message.runId);
      if (!response.ok && result.transient) {
        patchMessage(message.id, {
          diagnosticError: result.error || "De diagnostische statuscontrole is tijdelijk niet bereikbaar.",
        });
        return;
      }
      const status = String(result.status || message.status || "unknown").toLowerCase();
      patchMessage(message.id, {
        status,
        diagnosticError: result.error || undefined,
        diagnosticOutput: result.output || undefined,
        diagnostics: result.diagnostics || undefined,
        updatedAt: new Date().toISOString(),
        text: status === "completed"
          ? (result.output || message.text || "Klaar. Hermes heeft deze opdracht afgerond.")
          : (result.error || message.text || `Deze Hermes-run is beëindigd met status ${status}.`),
      });
    } catch (error) {
      patchMessage(message.id, {
        diagnosticError: error instanceof Error ? error.message : "Diagnose kon niet worden opgehaald.",
      });
    } finally {
      setDiagnosing((current) => ({ ...current, [message.id]: false }));
    }
  }

  useEffect(() => {
    if (!ready) return;
    const staleFailure = conversation.messages.find((message) => {
      const status = String(message.status || "").toLowerCase();
      return message.runId && FAILED.has(status) && !message.diagnosticChecked;
    });
    if (!staleFailure) return;
    patchMessage(staleFailure.id, { diagnosticChecked: true });
    void diagnose(staleFailure);
  }, [ready, conversation.messages]);

  useEffect(() => {
    if (!running?.runId) return;
    const runId = running.runId;
    const messageId = running.id;
    let stopped = false;
    let timeout = null;

    async function poll() {
      try {
        const { response, result } = await readRun(runId);
        if (stopped) return;

        if (!response.ok) {
          patchMessage(messageId, {
            lastPollError: result.error || `Status tijdelijk niet bereikbaar (HTTP ${response.status}). Hermes blijft als actief gemarkeerd.`,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const status = String(result.status || "unknown").toLowerCase();
          if (TERMINAL.has(status)) {
            patchMessage(messageId, {
              status,
              text: status === "completed"
                ? (result.output || "Klaar. Hermes heeft deze opdracht afgerond.")
                : (result.error || `Deze Hermes-run is beëindigd met status ${status}.`),
              diagnosticError: FAILED.has(status) ? result.error || undefined : undefined,
              diagnosticOutput: FAILED.has(status) ? result.output || undefined : undefined,
              diagnostics: result.diagnostics || undefined,
              diagnosticChecked: true,
              updatedAt: new Date().toISOString(),
              lastPollError: undefined,
            });
            return;
          }
          patchMessage(messageId, { status, updatedAt: new Date().toISOString(), lastPollError: undefined });
        }
      } catch {
        if (!stopped) {
          patchMessage(messageId, {
            lastPollError: "De laatste statuscontrole lukte niet. Hermes blijft op de server actief en het OS probeert automatisch opnieuw.",
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
  }, [running?.id, running?.runId]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [open, conversation.messages.length, running?.status]);

  async function startPrompt(prompt) {
    if (!prompt.trim() || busy) return;
    const userMessage = {
      id: makeId("user"),
      role: "user",
      text: prompt.trim(),
      createdAt: new Date().toISOString(),
    };
    setConversation((current) => ({ ...current, messages: [...current.messages, userMessage] }));
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt.trim(), environment: "research", session_id: conversation.sessionId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error || !result.run_id) {
        throw new Error(result.error || `Hermes kon de opdracht niet starten (HTTP ${response.status}).`);
      }

      const status = String(result.status || "started").toLowerCase();
      const startedAt = new Date().toISOString();
      setConversation((current) => ({
        ...current,
        messages: [...current.messages, {
          id: makeId("run"),
          role: "hermes",
          text: status === "completed"
            ? (result.output || "Klaar. Hermes heeft deze opdracht afgerond.")
            : "Hermes is met deze opdracht gestart. Je kunt dit venster sluiten, naar een andere pagina gaan of de website verversen; de run blijft op de server doorgaan.",
          createdAt: startedAt,
          updatedAt: startedAt,
          runId: result.run_id,
          status,
          startedAt,
          prompt: prompt.trim(),
        }],
      }));
    } catch (error) {
      setConversation((current) => ({
        ...current,
        messages: [...current.messages, {
          id: makeId("system"),
          role: "system",
          text: error instanceof Error ? error.message : "Hermes kon de opdracht niet starten.",
          createdAt: new Date().toISOString(),
          status: "failed",
        }],
      }));
    } finally {
      setSending(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await startPrompt(input);
  }

  async function retry(message) {
    if (busy) return;
    const prompt = message.prompt || previousUserPrompt(conversation.messages, message.id);
    if (!prompt) return;
    await startPrompt(prompt);
  }

  function newConversation() {
    if (running) return;
    if (!window.confirm("Nieuw gesprek starten? Het huidige gesprek wordt uit deze browser verwijderd.")) return;
    setConversation(freshConversation(`simple-hermes-owner-${Date.now()}`));
    setInput("");
  }

  return <>
    {running && !open && (
      <button className={styles.activePill} onClick={() => setOpen(true)}>
        <span className={styles.pulse} />
        <div><strong>Hermes onderzoekt</strong><small>{duration(running.startedAt, now)} bezig · bekijk voortgang</small></div>
      </button>
    )}

    {open && (
      <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
        <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()} aria-label="Praat met Hermes">
          <header className={styles.header}>
            <div>
              <span>Onderzoeksomgeving</span>
              <h2>Praat met Hermes</h2>
              <p>Gesprek en actieve research-runs blijven bewaard bij sluiten, navigeren en verversen.</p>
            </div>
            <div className={styles.headerActions}>
              <button onClick={newConversation} disabled={Boolean(running)}>Nieuw gesprek</button>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
          </header>

          {running && (
            <section className={styles.runBanner}>
              <div className={styles.runBannerTop}><span className={styles.pulse} /><strong>Hermes is nog bezig</strong><b>{duration(running.startedAt, now)}</b></div>
              <p>Deze opdracht draait op de server. Het sluiten van dit venster of verversen van de website stopt Hermes niet.</p>
              <div className={styles.runMeta}><span>Status: {running.status || "running"}</span><span>Gestart: {time(running.startedAt)}</span></div>
              {running.lastPollError && <small>{running.lastPollError}</small>}
            </section>
          )}

          <div className={styles.thread} ref={threadRef}>
            {conversation.messages.map((message) => {
              const status = String(message.status || "").toLowerCase();
              const failed = message.runId && FAILED.has(status);
              return (
                <article key={message.id} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}>
                  <div className={styles.messageHead}>
                    <strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong>
                    <time>{time(message.createdAt)}</time>
                  </div>
                  <p>{message.text}</p>
                  {isActive(message) && <div className={styles.messageRunning}><span className={styles.pulse} />Bezig · {duration(message.startedAt, now)}</div>}
                  {message.runId && message.status && TERMINAL.has(status) && (
                    <div className={status === "completed" ? styles.done : styles.failed}>{status === "completed" ? "✓ Afgerond" : `Status: ${status}`}</div>
                  )}
                  {failed && (
                    <div style={{marginTop:12,padding:12,border:"1px solid rgba(255,98,108,.28)",borderRadius:9,background:"rgba(255,98,108,.035)"}}>
                      <strong style={{display:"block",fontSize:9,textTransform:"uppercase",letterSpacing:'.08em',color:'#ff8d95'}}>Waarom mislukte deze run?</strong>
                      <p style={{marginTop:7}}>{message.diagnosticError || "De concrete backendreden wordt opgehaald. Klik op Diagnose opnieuw als die niet verschijnt."}</p>
                      {message.diagnosticOutput && <><strong style={{display:"block",marginTop:10,fontSize:9,color:'#7d8a91'}}>Laatste bruikbare output</strong><p>{message.diagnosticOutput}</p></>}
                      <details style={{marginTop:10,color:'#7d8a91',fontSize:9}}>
                        <summary style={{cursor:'pointer'}}>Technische details</summary>
                        <div style={{marginTop:8,fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',wordBreak:'break-all'}}>Run ID: {message.runId}</div>
                        {message.diagnostics?.backend_http_status !== undefined && <div style={{marginTop:4}}>Backend HTTP: {message.diagnostics.backend_http_status}</div>}
                        {Array.isArray(message.diagnostics?.backend_fields) && <div style={{marginTop:4}}>Velden: {message.diagnostics.backend_fields.join(', ')}</div>}
                      </details>
                      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                        <button type="button" onClick={() => diagnose(message)} disabled={diagnosing[message.id]} style={{border:'1px solid #354149',background:'#11181c',color:'#d8e0e4',borderRadius:7,padding:'7px 9px',fontSize:9,fontWeight:750,cursor:'pointer'}}>{diagnosing[message.id] ? 'Diagnose ophalen…' : 'Diagnose opnieuw'}</button>
                        <button type="button" onClick={() => retry(message)} disabled={busy} style={{border:0,background:'#c9ff35',color:'#080b0d',borderRadius:7,padding:'7px 9px',fontSize:9,fontWeight:850,cursor:'pointer'}}>Zelfde opdracht opnieuw</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {sending && <article className={styles.hermes}><strong>Hermes</strong><p>Opdracht wordt gestart…</p></article>}
          </div>

          <form className={styles.form} onSubmit={submit}>
            <textarea
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={running ? "Wacht tot de huidige opdracht is afgerond…" : "Bijvoorbeeld: onderzoek welke investment capability je nu het meest mist."}
              disabled={busy}
            />
            <div className={styles.formBottom}>
              <div><small>Research only · geen live trading</small><small>Gesprek wordt lokaal in deze browser bewaard</small></div>
              <button disabled={busy || !input.trim()}>{sending ? "Starten…" : running ? "Hermes is bezig" : "Verstuur"}</button>
            </div>
          </form>
        </aside>
      </div>
    )}
  </>;
}
