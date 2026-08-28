"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./persistent-hermes-chat.module.css";

type StoredMessage = {
  id: string;
  role: "user" | "hermes" | "system";
  text: string;
  createdAt: string;
  updatedAt?: string;
  runId?: string;
  status?: string;
  startedAt?: string;
  lastPollError?: string;
};

type StoredConversation = {
  version: 1;
  sessionId: string;
  messages: StoredMessage[];
};

type BrainRun = {
  run_id?: string;
  status?: string;
  output?: string;
  error?: string;
};

const STORAGE_KEY = "hermes-investment-os:owner-chat:v1";
const DEFAULT_SESSION = "simple-hermes-owner";
const TERMINAL = new Set(["completed", "failed", "cancelled", "stopped"]);
const ACTIVE = new Set(["queued", "pending", "started", "running", "unknown"]);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function welcomeMessage(): StoredMessage {
  return {
    id: "welcome",
    role: "hermes",
    text: "Je kunt mij hier iets vragen over mijn onderzoek, het systeem of mijn volgende stap. Lange opdrachten blijven op de server doorlopen als je dit venster sluit of de pagina ververst.",
    createdAt: new Date().toISOString(),
  };
}

function initialConversation(): StoredConversation {
  return { version: 1, sessionId: DEFAULT_SESSION, messages: [welcomeMessage()] };
}

function loadConversation(): StoredConversation {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialConversation();
    const parsed = JSON.parse(raw) as Partial<StoredConversation>;
    const messages = Array.isArray(parsed.messages) ? parsed.messages.filter(Boolean) as StoredMessage[] : [];
    return {
      version: 1,
      sessionId: typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : DEFAULT_SESSION,
      messages: messages.length ? messages : [welcomeMessage()],
    };
  } catch {
    return initialConversation();
  }
}

function saveConversation(conversation: StoredConversation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...conversation,
      messages: conversation.messages.slice(-120),
    }));
  } catch {
    // Chat blijft bruikbaar als browseropslag niet beschikbaar is.
  }
}

function isActive(message: StoredMessage) {
  return Boolean(message.runId && ACTIVE.has(String(message.status || "unknown")));
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function elapsed(startedAt?: string, now = Date.now()) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}:${String(rest).padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}u ${minutes % 60}m`;
}

export function PersistentHermesChat() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [conversation, setConversation] = useState<StoredConversation>(initialConversation);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setConversation(loadConversation());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveConversation(conversation);
  }, [conversation, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function intercept(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!target) return;
      const text = (target.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("praat met hermes") || text === "stel een vraag") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setOpen(true);
      }
    }
    window.addEventListener("click", intercept, true);
    return () => window.removeEventListener("click", intercept, true);
  }, []);

  const activeMessage = useMemo(
    () => conversation.messages.find((message) => isActive(message)) || null,
    [conversation.messages],
  );
  const busy = sending || Boolean(activeMessage);

  useEffect(() => {
    if (!activeMessage?.runId) return;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeMessage.runId!)}?environment=research`, { cache: "no-store" });
        const run = (await response.json().catch(() => ({}))) as BrainRun;
        if (cancelled) return;

        if (!response.ok) {
          setConversation((current) => ({
            ...current,
            messages: current.messages.map((message) => message.id === activeMessage.id ? {
              ...message,
              lastPollError: run.error || `Status tijdelijk niet bereikbaar (HTTP ${response.status}).`,
              updatedAt: new Date().toISOString(),
            } : message),
          }));
        } else {
          const status = String(run.status || "unknown").toLowerCase();
          if (TERMINAL.has(status)) {
            setConversation((current) => ({
              ...current,
              messages: current.messages.map((message) => message.id === activeMessage.id ? {
                ...message,
                status,
                text: status === "completed"
                  ? (run.output || "Klaar. Hermes heeft deze opdracht afgerond.")
                  : (run.error || `Deze Hermes-run is beëindigd met status ${status}.`),
                updatedAt: new Date().toISOString(),
                lastPollError: undefined,
              } : message),
            }));
            return;
          }

          setConversation((current) => ({
            ...current,
            messages: current.messages.map((message) => message.id === activeMessage.id ? {
              ...message,
              status,
              updatedAt: new Date().toISOString(),
              lastPollError: undefined,
            } : message),
          }));
        }
      } catch {
        if (!cancelled) {
          setConversation((current) => ({
            ...current,
            messages: current.messages.map((message) => message.id === activeMessage.id ? {
              ...message,
              lastPollError: "De statusverbinding is tijdelijk weg. Hermes wordt niet als mislukt gemarkeerd; het OS probeert opnieuw.",
              updatedAt: new Date().toISOString(),
            } : message),
          }));
        }
      }
      if (!cancelled) timer = window.setTimeout(poll, 4000);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeMessage?.id, activeMessage?.runId]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [open, conversation.messages.length, activeMessage?.status]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;

    const userMessage: StoredMessage = {
      id: makeId("user"),
      role: "user",
      text: prompt,
      createdAt: new Date().toISOString(),
    };
    setConversation((current) => ({ ...current, messages: [...current.messages, userMessage] }));
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt, environment: "research", session_id: conversation.sessionId }),
      });
      const run = (await response.json().catch(() => ({}))) as BrainRun;
      if (!response.ok || run.error || !run.run_id) {
        throw new Error(run.error || `Hermes kon de opdracht niet starten (HTTP ${response.status}).`);
      }

      const status = String(run.status || "started").toLowerCase();
      const startedAt = new Date().toISOString();
      const hermesMessage: StoredMessage = {
        id: makeId("run"),
        role: "hermes",
        text: status === "completed"
          ? (run.output || "Klaar. Hermes heeft deze opdracht afgerond.")
          : "Hermes is met deze opdracht gestart. Je kunt dit venster sluiten of de pagina verversen; de run blijft op de server doorgaan.",
        createdAt: startedAt,
        updatedAt: startedAt,
        runId: run.run_id,
        status,
        startedAt,
      };
      setConversation((current) => ({ ...current, messages: [...current.messages, hermesMessage] }));
    } catch (error) {
      const systemMessage: StoredMessage = {
        id: makeId("system"),
        role: "system",
        text: error instanceof Error ? error.message : "Hermes kon de opdracht niet starten.",
        createdAt: new Date().toISOString(),
        status: "failed",
      };
      setConversation((current) => ({ ...current, messages: [...current.messages, systemMessage] }));
    } finally {
      setSending(false);
    }
  }

  function resetConversation() {
    if (activeMessage) return;
    if (!window.confirm("Nieuw gesprek starten? Het huidige lokale gesprek wordt uit deze browser verwijderd.")) return;
    const next = initialConversation();
    next.sessionId = `simple-hermes-owner-${Date.now()}`;
    setConversation(next);
    setInput("");
  }

  return <>
    {activeMessage && !open && (
      <button className={styles.activePill} onClick={() => setOpen(true)}>
        <span className={styles.pulse} />
        <div><strong>Hermes onderzoekt</strong><small>{elapsed(activeMessage.startedAt, now)} bezig · bekijk voortgang</small></div>
      </button>
    )}

    {open && (
      <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
        <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()} aria-label="Praat met Hermes">
          <header className={styles.header}>
            <div>
              <span>Onderzoeksomgeving</span>
              <h2>Praat met Hermes</h2>
              <p>Het gesprek en actieve runs blijven bewaard bij sluiten en verversen.</p>
            </div>
            <div className={styles.headerActions}>
              <button onClick={resetConversation} disabled={Boolean(activeMessage)}>Nieuw gesprek</button>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
          </header>

          {activeMessage && (
            <section className={styles.runBanner}>
              <div className={styles.runBannerTop}><span className={styles.pulse} /><strong>Hermes is nog bezig</strong><b>{elapsed(activeMessage.startedAt, now)}</b></div>
              <p>Deze opdracht draait op de server. Je kunt dit venster sluiten, naar een andere pagina gaan of de website verversen.</p>
              <div className={styles.runMeta}><span>Status: {activeMessage.status || "running"}</span><span>Gestart: {formatTime(activeMessage.startedAt)}</span></div>
              {activeMessage.lastPollError && <small>{activeMessage.lastPollError}</small>}
            </section>
          )}

          <div className={styles.thread} ref={threadRef}>
            {conversation.messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}>
                <div className={styles.messageHead}>
                  <strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong>
                  <time>{formatTime(message.createdAt)}</time>
                </div>
                <p>{message.text}</p>
                {isActive(message) && (
                  <div className={styles.messageRunning}><span className={styles.pulse} />Bezig · {elapsed(message.startedAt, now)}</div>
                )}
                {message.status && TERMINAL.has(String(message.status)) && message.runId && (
                  <div className={message.status === "completed" ? styles.done : styles.failed}>{message.status === "completed" ? "✓ Afgerond" : `Status: ${message.status}`}</div>
                )}
              </article>
            ))}
            {sending && <article className={styles.hermes}><strong>Hermes</strong><p>Opdracht wordt gestart…</p></article>}
          </div>

          <form className={styles.form} onSubmit={submit}>
            <textarea
              rows={4}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeMessage ? "Wacht tot de huidige opdracht is afgerond…" : "Bijvoorbeeld: onderzoek welke investment capability je nu het meest mist."}
              disabled={busy}
            />
            <div className={styles.formBottom}>
              <div><small>Research only · geen live trading</small><small>Gesprek wordt lokaal in deze browser bewaard</small></div>
              <button disabled={busy || !input.trim()}>{sending ? "Starten…" : activeMessage ? "Hermes is bezig" : "Verstuur"}</button>
            </div>
          </form>
        </aside>
      </div>
    )}
  </>;
}
