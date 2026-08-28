"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./persistent-hermes-chat.module.css";

type Message = {
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

type Conversation = {
  version: 1;
  sessionId: string;
  messages: Message[];
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

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function welcome(): Message {
  return {
    id: "welcome",
    role: "hermes",
    text: "Je kunt mij hier iets vragen over mijn onderzoek, het systeem of mijn volgende stap. Lange opdrachten blijven op de server doorlopen als je dit venster sluit of de pagina ververst.",
    createdAt: new Date().toISOString(),
  };
}

function freshConversation(sessionId = DEFAULT_SESSION): Conversation {
  return { version: 1, sessionId, messages: [welcome()] };
}

function readStoredConversation(): Conversation {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshConversation();
    const parsed = JSON.parse(raw) as Partial<Conversation>;
    const messages = Array.isArray(parsed.messages) ? (parsed.messages.filter(Boolean) as Message[]) : [];
    return {
      version: 1,
      sessionId: typeof parsed.sessionId === "string" && parsed.sessionId ? parsed.sessionId : DEFAULT_SESSION,
      messages: messages.length ? messages : [welcome()],
    };
  } catch {
    return freshConversation();
  }
}

function writeStoredConversation(conversation: Conversation) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...conversation,
      messages: conversation.messages.slice(-120),
    }));
  } catch {
    // Browseropslag is een UX-extra; de research-run zelf blijft server-side draaien.
  }
}

function activeRun(message: Message) {
  return Boolean(message.runId && !TERMINAL.has(String(message.status || "unknown").toLowerCase()));
}

function clock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function duration(startedAt: string | undefined, now: number) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}u ${minutes % 60}m`;
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PersistentHermesChatV2() {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [conversation, setConversation] = useState<Conversation>(() => freshConversation());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConversation(readStoredConversation());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeStoredConversation(conversation);
  }, [conversation, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!element) return;
      const text = (element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!text.includes("praat met hermes") && text !== "stel een vraag") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    window.addEventListener("click", intercept, true);
    return () => window.removeEventListener("click", intercept, true);
  }, []);

  const runningMessage = useMemo(
    () => conversation.messages.find((message) => activeRun(message)) || null,
    [conversation.messages],
  );
  const busy = sending || Boolean(runningMessage);

  useEffect(() => {
    if (!runningMessage?.runId) return;
    const runId = runningMessage.runId;
    const messageId = runningMessage.id;
    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | undefined;

    const updateMessage = (patch: Partial<Message>) => {
      setConversation((current) => ({
        ...current,
        messages: current.messages.map((message) => message.id === messageId ? { ...message, ...patch } : message),
      }));
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/brain/runs/${encodeURIComponent(runId)}?environment=research`, { cache: "no-store" });
        const run = (await response.json().catch(() => ({}))) as BrainRun;
        if (cancelled) return;

        if (!response.ok) {
          updateMessage({
            lastPollError: run.error || `Status tijdelijk niet bereikbaar (HTTP ${response.status}). Hermes blijft als actief gemarkeerd.`,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const status = String(run.status || "unknown").toLowerCase();
          if (TERMINAL.has(status)) {
            updateMessage({
              status,
              text: status === "completed"
                ? (run.output || "Klaar. Hermes heeft deze opdracht afgerond.")
                : (run.error || `Deze Hermes-run is beëindigd met status ${status}.`),
              updatedAt: new Date().toISOString(),
              lastPollError: undefined,
            });
            return;
          }
          updateMessage({ status, updatedAt: new Date().toISOString(), lastPollError: undefined });
        }
      } catch {
        if (!cancelled) {
          updateMessage({
            lastPollError: "De statusverbinding is tijdelijk weg. Het OS markeert de run niet als mislukt en probeert automatisch opnieuw.",
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 4000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [runningMessage?.id, runningMessage?.runId]);

  useEffect(() => {
    if (!open || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [open, conversation.messages.length, runningMessage?.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;

    const userMessage: Message = {
      id: id("user"),
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
      const message: Message = {
        id: id("run"),
        role: "hermes",
        text: status === "completed"
          ? (run.output || "Klaar. Hermes heeft deze opdracht afgerond.")
          : "Hermes is met deze opdracht gestart. Je kunt dit venster sluiten, naar een andere pagina gaan of de website verversen; de run blijft op de server doorgaan.",
        createdAt: startedAt,
        updatedAt: startedAt,
        runId: run.run_id,
        status,
        startedAt,
      };
      setConversation((current) => ({ ...current, messages: [...current.messages, message] }));
    } catch (error) {
      setConversation((current) => ({
        ...current,
        messages: [...current.messages, {
          id: id("system"),
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

  function startNewConversation() {
    if (runningMessage) return;
    if (!window.confirm("Nieuw gesprek starten? Het huidige gesprek wordt uit deze browser verwijderd.")) return;
    setConversation(freshConversation(`simple-hermes-owner-${Date.now()}`));
    setInput("");
  }

  return <>
    {runningMessage && !open && (
      <button className={styles.activePill} onClick={() => setOpen(true)}>
        <span className={styles.pulse} />
        <div><strong>Hermes onderzoekt</strong><small>{duration(runningMessage.startedAt, now)} bezig · bekijk voortgang</small></div>
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
              <button onClick={startNewConversation} disabled={Boolean(runningMessage)}>Nieuw gesprek</button>
              <button className={styles.close} onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
            </div>
          </header>

          {runningMessage && (
            <section className={styles.runBanner}>
              <div className={styles.runBannerTop}><span className={styles.pulse} /><strong>Hermes is nog bezig</strong><b>{duration(runningMessage.startedAt, now)}</b></div>
              <p>Deze opdracht draait op de server. Het sluiten van dit venster of verversen van de website stopt Hermes niet.</p>
              <div className={styles.runMeta}><span>Status: {runningMessage.status || "running"}</span><span>Gestart: {clock(runningMessage.startedAt)}</span></div>
              {runningMessage.lastPollError && <small>{runningMessage.lastPollError}</small>}
            </section>
          )}

          <div className={styles.thread} ref={threadRef}>
            {conversation.messages.map((message) => (
              <article key={message.id} className={message.role === "user" ? styles.you : message.role === "system" ? styles.system : styles.hermes}>
                <div className={styles.messageHead}>
                  <strong>{message.role === "user" ? "Jij" : message.role === "system" ? "Systeem" : "Hermes"}</strong>
                  <time>{clock(message.createdAt)}</time>
                </div>
                <p>{message.text}</p>
                {activeRun(message) && <div className={styles.messageRunning}><span className={styles.pulse} />Bezig · {duration(message.startedAt, now)}</div>}
                {message.runId && message.status && TERMINAL.has(message.status.toLowerCase()) && (
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
              placeholder={runningMessage ? "Wacht tot de huidige opdracht is afgerond…" : "Bijvoorbeeld: onderzoek welke investment capability je nu het meest mist."}
              disabled={busy}
            />
            <div className={styles.formBottom}>
              <div><small>Research only · geen live trading</small><small>Gesprek wordt lokaal in deze browser bewaard</small></div>
              <button disabled={busy || !input.trim()}>{sending ? "Starten…" : runningMessage ? "Hermes is bezig" : "Verstuur"}</button>
            </div>
          </form>
        </aside>
      </div>
    )}
  </>;
}
