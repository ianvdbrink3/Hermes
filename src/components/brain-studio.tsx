"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { HermesShell, type HermesTone } from "./hermes-shell";
import styles from "./brain-studio-v2.module.css";

type RecordLike = Record<string, unknown>;
type Capability = { id?: string; name?: string; type?: string; description?: string; category?: string };
type BrainStatus = {
  production?: { state?: string; profile?: string; model?: string; message?: string };
  research?: { state?: string; profile?: string; message?: string };
  builder?: { state?: string; profile?: string; message?: string };
  skills?: { state?: string; data?: unknown[] };
  toolsets?: { state?: string; data?: unknown[] };
  productionPolicy?: { promotionEnabled?: boolean; builderMutationEnabled?: boolean; explanation?: string };
};
type RuntimeSnapshot = {
  runtime?: { state?: string; reason?: string | null };
  provider?: { state?: string; model?: string; retryNotBeforeUtc?: string | null };
  compute?: { available?: boolean; runs24h?: number | null; maxRuns24h?: number | null; promptTokens24h?: number | null; maxPromptTokens24h?: number | null };
};
type BrainRun = { run_id?: string; status?: string; output?: string; error?: string; session_id?: string; policy?: { code?: string }; invocationPolicy?: { code?: string } };
type Message = { id: string; role: "user" | "hermes" | "system"; text: string; at: string };
type ImprovementSession = { id?: string; session_id?: string; title?: string; updated_at?: unknown; created_at?: unknown };

const presets = [
  { label: "Analyseer recente fouten", prompt: "Analyseer recente fouten in je investeringsanalyses. Segmenteer patronen, gebruik beschikbaar bewijs en benoem waar bewijs onvoldoende is. Verander production niet." },
  { label: "Zoek capability-gaps", prompt: "Bekijk je huidige investment capabilities en identificeer maximaal drie aantoonbare capability-gaps. Geef per gap bewijs, impact, ontbrekende data en een valide testmethode. Verander production niet." },
  { label: "Ontwerp één verbetering", prompt: "Identificeer op basis van beschikbaar bewijs één structurele zwakte in je investment intelligence en ontwerp één meetbare capability improvement. Verander production niet." },
];

const lifecycle = ["DRAFT", "RESEARCHING", "PROPOSED", "TESTING", "VALIDATED", "HUMAN APPROVED", "BUILT", "PAPER", "PRODUCTION"];

function nowLabel() {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function extractSessions(value: unknown): ImprovementSession[] {
  if (Array.isArray(value)) return value.filter((item): item is ImprovementSession => Boolean(item && typeof item === "object"));
  const source = record(value);
  for (const key of ["sessions", "data", "items", "results", "payload"]) {
    const nested = source[key];
    if (Array.isArray(nested)) return nested.filter((item): item is ImprovementSession => Boolean(item && typeof item === "object"));
    if (nested && typeof nested === "object") {
      const deeper = extractSessions(nested);
      if (deeper.length) return deeper;
    }
  }
  return [];
}

function runtimeTone(state?: string): HermesTone {
  if (state === "READY" || state === "RUNNING") return "good";
  if (state?.startsWith("WAITING") || state === "DEGRADED" || state === "IDLE") return "warn";
  if (state?.startsWith("BLOCKED") || state === "OFFLINE" || state === "NEEDS_HUMAN") return "bad";
  return "muted";
}

function runTerminal(status?: string) {
  return ["completed", "failed", "cancelled", "stopped"].includes(String(status));
}

export function BrainStudio() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Brain Studio werkt alleen in his-research. Production is inspect-only. Handmatige modelruns worden eerst door de centrale runtimepolicy gecontroleerd.", at: nowLabel() },
  ]);
  const [consoleInput, setConsoleInput] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const [activeRun, setActiveRun] = useState<BrainRun | null>(null);
  const [improvementGoal, setImprovementGoal] = useState("");
  const [improvementBusy, setImprovementBusy] = useState(false);
  const [improvementSessions, setImprovementSessions] = useState<ImprovementSession[]>([]);
  const [persistence, setPersistence] = useState("hermes_session");

  async function load() {
    const [statusResponse, runtimeResponse, capabilityResponse, improvementResponse] = await Promise.all([
      fetch("/api/brain/status", { cache: "no-store" }),
      fetch("/api/os/snapshot", { cache: "no-store" }),
      fetch("/api/brain/capabilities", { cache: "no-store" }),
      fetch("/api/brain/improvements", { cache: "no-store" }),
    ]);
    const statusData = await statusResponse.json().catch(() => ({}));
    const runtimeData = await runtimeResponse.json().catch(() => ({}));
    const capabilityData = await capabilityResponse.json().catch(() => ({}));
    const improvementData = await improvementResponse.json().catch(() => ({}));
    setStatus(statusData as BrainStatus);
    setRuntime(runtimeData as RuntimeSnapshot);
    setCapabilities(Array.isArray(capabilityData.items) ? capabilityData.items : []);
    setImprovementSessions(extractSessions(improvementData.items));
    setPersistence(typeof improvementData.persistence === "string" ? improvementData.persistence : "hermes_session");
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!activeRun?.run_id || runTerminal(activeRun.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeRun.run_id || "")}?environment=research`, { cache: "no-store" });
        const run = (await response.json()) as BrainRun;
        setActiveRun(run);
        if (runTerminal(run.status)) {
          setRunBusy(false);
          setMessages((current) => [...current, { id: `${run.run_id}-result`, role: run.status === "completed" ? "hermes" : "system", text: run.output || run.error || `Run ${run.status}.`, at: nowLabel() }]);
          void load();
        }
      } catch {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `poll-error-${Date.now()}`, role: "system", text: "De verbinding met deze Hermes-run is verbroken.", at: nowLabel() }]);
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [activeRun]);

  const filteredCapabilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return capabilities.filter((item) => !q || `${item.name} ${item.description} ${item.category} ${item.type}`.toLowerCase().includes(q));
  }, [capabilities, query]);

  async function runConsole(input: string) {
    const clean = input.trim();
    if (!clean || runBusy) return;
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text: clean, at: nowLabel() }]);
    setConsoleInput("");
    setRunBusy(true);
    setActiveRun(null);
    try {
      const response = await fetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: clean, environment: "research", session_id: "brain-research-primary", source: "brain_studio" }),
      });
      const run = (await response.json()) as BrainRun;
      if (!response.ok || run.error) {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `blocked-${Date.now()}`, role: "system", text: run.error || `Runtimepolicy blokkeerde de run (${run.policy?.code || response.status}).`, at: nowLabel() }]);
        return;
      }
      setActiveRun(run);
      if (runTerminal(run.status)) {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `${run.run_id}-instant`, role: "hermes", text: run.output || "Run afgerond.", at: nowLabel() }]);
      }
    } catch {
      setRunBusy(false);
      setMessages((current) => [...current, { id: `network-${Date.now()}`, role: "system", text: "Brain Studio kon Hermes niet bereiken.", at: nowLabel() }]);
    }
  }

  async function createImprovement(event: FormEvent) {
    event.preventDefault();
    const goal = improvementGoal.trim();
    if (!goal || improvementBusy) return;
    setImprovementBusy(true);
    try {
      const response = await fetch("/api/brain/improvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userGoal: goal }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessages((current) => [...current, { id: `improvement-error-${Date.now()}`, role: "system", text: data.error || "Improvement research kon niet starten.", at: nowLabel() }]);
        return;
      }
      setImprovementGoal("");
      if (data.run) {
        setActiveRun(data.run as BrainRun);
        setRunBusy(!runTerminal(data.run.status));
        setMessages((current) => [...current, { id: `improvement-${Date.now()}`, role: "system", text: `Persistente improvement research gestart in Hermes-session ${data.item?.sessionId || data.item?.id || "onbekend"}.`, at: nowLabel() }]);
      }
      await load();
    } finally {
      setImprovementBusy(false);
    }
  }

  function submitConsole(event: FormEvent) {
    event.preventDefault();
    void runConsole(consoleInput);
  }

  const tone = runtimeTone(runtime?.runtime?.state);
  const statusText = runtime?.runtime?.state ? `Research: ${runtime.runtime.state}` : "Researchstatus laden…";

  return <HermesShell active="instellingen" status={statusText} statusTone={tone} wide actions={<button onClick={() => void load()}>Ververs</button>}>
    <section className={styles.intro}>
      <div><span className={styles.eyebrow}>Hermes-ontwikkeling</span><h1>Brain Studio</h1><p>Onderzoek, challenge en verbeter Hermes' investment intelligence zonder een tweede brein in de webapp te bouwen. Production is alleen zichtbaar; elke actieve run gaat naar his-research en respecteert de runtimepolicy.</p></div>
      <div className={styles.policy}>Production mutation: BLOCKED · Browser execution: LOCKED</div>
    </section>

    <section className={styles.guard}><span>Gecontroleerde verbetering</span><strong>Research mag voorstellen; bewijs bepaalt of iets verder mag.</strong><p>De lifecycle is expliciet. Een improvement wordt nu als echte Hermes research-session bewaard in plaats van in een vluchtige Vercel-memory map.</p></section>

    <section className={styles.workspace}>
      <div className={styles.panel}>
        <div className={styles.panelHead}><div><span>Researchconsole</span><h2>Directe intelligence-interface</h2></div><small>his-research only</small></div>
        <div className={styles.thread}>{messages.map((message) => <article key={message.id} className={`${styles.message} ${styles[`message_${message.role}`]}`}><header><strong>{message.role === "user" ? "JIJ" : message.role === "hermes" ? "HERMES" : "SYSTEEM"}</strong><time>{message.at}</time></header><p>{message.text}</p></article>)}{runBusy && <article className={`${styles.message} ${styles.message_hermes}`}><header><strong>HERMES</strong><time>RUNNING</time></header><p>Researchrun actief. De runtimepolicy is al gecontroleerd.</p></article>}</div>
        <div className={styles.presets}>{presets.map((preset) => <button key={preset.label} onClick={() => setConsoleInput(preset.prompt)}>{preset.label}</button>)}</div>
        <form className={styles.form} onSubmit={submitConsole}><textarea rows={5} value={consoleInput} onChange={(event) => setConsoleInput(event.target.value)} placeholder="Vraag Hermes om een probleem te onderzoeken, bewijs te beoordelen of een improvement te ontwerpen…" /><div><small>Research only · provider- en budgetpolicy · geen production mutation</small><button disabled={runBusy || !consoleInput.trim()}>{runBusy ? "BEZIG" : "START HERMES"}</button></div></form>
      </div>

      <aside className={styles.panel}>
        <div className={styles.panelHead}><div><span>Actuele grenzen</span><h2>Wat is echt aangesloten?</h2></div></div>
        <div className={styles.statusGrid}>
          <div><span>Research</span><strong>{status?.research?.state || "—"}</strong></div>
          <div><span>Production</span><strong>{status?.production?.state || "—"}</strong></div>
          <div><span>Model</span><strong>{status?.production?.model || runtime?.provider?.model || "—"}</strong></div>
          <div><span>Runtime</span><strong>{runtime?.runtime?.state || "—"}</strong></div>
          <div><span>Runs 24 uur</span><strong>{runtime?.compute?.available ? `${runtime.compute.runs24h ?? "—"} / ${runtime.compute.maxRuns24h ?? "—"}` : "—"}</strong></div>
          <div><span>Prompttokens</span><strong>{runtime?.compute?.available ? `${runtime.compute.promptTokens24h ?? "—"} / ${runtime.compute.maxPromptTokens24h ?? "—"}` : "—"}</strong></div>
        </div>
        <div className={styles.inspect} style={{ marginTop: 12 }}><span>Production</span><strong className={styles.locked}>Alleen inspectie</strong><p>Er is bewust geen production-invoerveld. `/api/brain/run` accepteert uitsluitend `environment=research`.</p></div>
        <div className={styles.inspect} style={{ marginTop: 10 }}><span>Provider</span><strong>{runtime?.provider?.state || "—"}</strong><p>{runtime?.provider?.retryNotBeforeUtc ? `Retry niet vóór ${runtime.provider.retryNotBeforeUtc}` : runtime?.runtime?.reason || "Geen actieve providerblokkade gerapporteerd."}</p></div>
      </aside>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><span>Capability inventory</span><h2>Wat Hermes kan</h2></div><small>{filteredCapabilities.length} zichtbaar</small></div>
      <div className={styles.panel}>
        <div className={styles.filters}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek skills, toolsets of categorieën…" /></div>
        <div className={styles.capabilityList}>{filteredCapabilities.slice(0, 20).map((item, index) => <article key={item.id || `${item.name}-${index}`}><strong>{item.name || "Capability"}</strong><p>{item.description || "Geen beschrijving gerapporteerd."}</p><small>{item.type || "unknown"} · {item.category || "uncategorized"}</small></article>)}{!filteredCapabilities.length && <div className={styles.notice}>Geen capabilities geladen. Brain Studio verzint geen inventory wanneer Hermes die niet levert.</div>}</div>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><span>Improvement lifecycle</span><h2>Duurzame improvement research</h2></div><small>persistence: {persistence}</small></div>
      <div className={styles.lifecycle}>{lifecycle.map((step) => <span key={step}>{step}</span>)}</div>
      <div className={styles.improvementGrid} style={{ marginTop: 12 }}>
        <form className={`${styles.panel} ${styles.improvementForm}`} onSubmit={createImprovement}><div className={styles.panelHead}><div><span>Nieuwe improvement</span><h2>Start met bewijs</h2></div></div><textarea rows={6} value={improvementGoal} onChange={(event) => setImprovementGoal(event.target.value)} placeholder="Beschrijf de capability of zwakte die Hermes moet onderzoeken…" /><div><small>Maakt eerst een persistente his-research sessie en start daarna policy-gated research.</small><button disabled={improvementBusy || !improvementGoal.trim()}>{improvementBusy ? "START…" : "START IMPROVEMENT RESEARCH"}</button></div></form>
        <div className={styles.panel}><div className={styles.panelHead}><div><span>Persistente sessies</span><h2>Recente improvements</h2></div></div><div className={styles.improvementList}>{improvementSessions.slice(0, 10).map((item, index) => <article key={item.id || item.session_id || index}><strong>{item.title || item.id || item.session_id || "Improvement session"}</strong><p>Opgeslagen in Hermes research-session; niet in Vercel-process memory.</p><small>{String(item.updated_at || item.created_at || "")}</small></article>)}{!improvementSessions.length && <div className={styles.notice}>Nog geen improvement-sessies gevonden, of de Hermes session-search geeft ze nog niet terug.</div>}</div></div>
      </div>
    </section>
  </HermesShell>;
}
