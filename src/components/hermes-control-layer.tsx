"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { BrainStatus, CapabilityItem } from "@/lib/brain/types";
import styles from "./hermes-control-layer.module.css";

type ControlEnvironment = "research" | "production";

type HermesSession = {
  id?: string;
  session_id?: string;
  sessionId?: string;
  title?: string | null;
  source?: string;
  model?: string;
  preview?: string;
  started_at?: string;
  updated_at?: string;
  ended_at?: string | null;
  created_at?: string;
  message_count?: number;
  tool_call_count?: number;
  active?: boolean;
  parent_session_id?: string | null;
  [key: string]: unknown;
};

type HermesMessage = {
  id?: string | number;
  role?: string;
  content?: unknown;
  text?: unknown;
  output?: unknown;
  created_at?: string;
  timestamp?: string;
  tool_name?: string;
  name?: string;
  tool_calls?: unknown[];
  token_count?: number;
  [key: string]: unknown;
};

type ActivityItem = {
  id: string;
  type: string;
  label: string;
  detail?: string;
  at: string;
  state: "live" | "done" | "info" | "error";
};

type ArtifactItem = {
  path: string;
  kind: string;
  source: "session" | "live";
};

type MissionSnapshot = {
  objective: string;
  completed: string;
  inProgress: string;
  next: string;
  blockers: string;
  context: string;
  raw: string;
  at: string;
  sessionId: string;
};

type StatusResponse = BrainStatus & {
  productionPolicy?: { promotionEnabled: boolean; builderMutationEnabled: boolean; explanation: string };
};

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "stopped"]);

const quickActions = [
  {
    label: "Continue current plan",
    prompt: "Ga verder met het hoogste-prioriteit unfinished item uit je bestaande investment-system plan. Inspecteer eerst je relevante persisted sessions, memory, project files en recente outputs. Vertel kort wat je hervat en waarom, en ga daarna daadwerkelijk verder. Verander geen broker execution-instellingen of harde risk limits zonder expliciete menselijke approval.",
  },
  {
    label: "Review your progress",
    prompt: "Review je eigen voortgang als investment system. Gebruik je persisted plan, recente sessions, research, backtests en gemaakte artifacts. Benoem wat aantoonbaar af is, wat half-af is, wat niet werkt en wat nu de hoogste leverage vervolgstap is. Maak geen nieuwe roadmap als er al een bestaande roadmap is; werk vanuit je bestaande plan.",
  },
  {
    label: "Show blockers",
    prompt: "Inspecteer je huidige investment-system plan en werkstatus. Geef alleen de echte blockers die je nu verhinderen om verder te komen, welke daarvan je zelf kunt oplossen en welke input of toegang je van mij nodig hebt. Gebruik bestaande state en bewijs; verzin geen blockers.",
  },
  {
    label: "Review latest backtest",
    prompt: "Zoek je meest recente relevante backtest of backtestanalyse in je eigen workspace/sessions. Review de resultaten, methodologie, sample size, mogelijke leakage/overfitting en de openstaande vervolgstap volgens je bestaande plan. Als je geen betrouwbare backtest kunt vinden, zeg dat expliciet.",
  },
  {
    label: "Explain architecture",
    prompt: "Leg je huidige investment-brain architectuur uit zoals die nu werkelijk bestaat: agents, skills, data, strategy/backtest onderdelen, risk guards, jobs en belangrijke files. Baseer dit op je huidige workspace en persisted state, niet op een ideale toekomstige architectuur.",
  },
  {
    label: "Find weakest capability",
    prompt: "Inspecteer je huidige investment capabilities en bestaand bewijs. Identificeer de zwakste capability die aantoonbaar de meeste performance of betrouwbaarheid kost. Gebruik je eigen bestaande plan en eerdere tests. Stel alleen een wijziging voor als het bewijs dat ondersteunt; verander production niet stilzwijgend.",
  },
  {
    label: "Continue last research",
    prompt: "Vind je meest recente onafgeronde investment research task en ga daar verder vanaf het laatste concrete punt. Lees eerst de relevante session/history/files zodat je niets opnieuw uitvindt. Rapporteer daarna wat je hebt voortgezet en wat de volgende stap is.",
  },
  {
    label: "Re-evaluate priorities",
    prompt: "Herbeoordeel de prioriteiten binnen je bestaande investment-system plan op basis van de huidige voortgang, recente resultaten en blockers. Verander de roadmap alleen als nieuw bewijs daar aanleiding toe geeft. Geef expliciet aan wat hetzelfde blijft en wat je eventueel anders prioriteert.",
  },
];

const MISSION_PROMPT = `Maak een actuele snapshot van je EIGEN bestaande investment-system plan. Inspecteer daarvoor je persisted sessions, memory, relevante project files, recente research/backtests en openstaande taken. Baseer je antwoord op wat werkelijk bestaat; verzin niets en ontwerp geen nieuwe roadmap als er al een plan bestaat.\n\nGebruik exact deze headings en vul ze concreet in:\nCURRENT OBJECTIVE:\nCOMPLETED:\nIN PROGRESS:\nNEXT:\nBLOCKERS:\nIMPORTANT CONTEXT:\n\nAls informatie ontbreekt, zet dat onder de relevante heading. Verander geen broker execution-instellingen of harde risk limits.`;

const artifactPattern = /(?:~\/|\/)[^\s\n\r\t"'`<>]+?\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|odt|rtf|txt|md|epub|xlsx?|ods|csv|tsv|json|xml|ya?ml|pptx?|odp|key|zip|tar|gz|tgz|html?)(?=$|[\s\n\r\t"'`<>),.;:])/gi;

function sessionId(session: HermesSession | null | undefined) {
  if (!session) return "";
  return String(session.id || session.session_id || session.sessionId || "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function unwrap(value: unknown) {
  const record = asRecord(value);
  return record && "payload" in record ? record.payload : value;
}

function extractSessions(value: unknown): HermesSession[] {
  const payload = unwrap(value);
  if (Array.isArray(payload)) return payload as HermesSession[];
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ["sessions", "items", "results", "data"]) {
    if (Array.isArray(record[key])) return record[key] as HermesSession[];
  }
  return [];
}

function extractSession(value: unknown): HermesSession | null {
  const payload = unwrap(value);
  const record = asRecord(payload);
  if (!record) return null;
  const nested = asRecord(record.session);
  return (nested || record) as HermesSession;
}

function extractMessages(value: unknown): HermesMessage[] {
  const payload = unwrap(value);
  if (Array.isArray(payload)) return payload as HermesMessage[];
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ["messages", "items", "data"]) {
    if (Array.isArray(record[key])) return record[key] as HermesMessage[];
  }
  return [];
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      if (!record) return "";
      return textFromUnknown(record.text ?? record.content ?? record.output ?? record.value ?? "");
    }).filter(Boolean).join("\n");
  }
  const record = asRecord(value);
  if (!record) return "";
  for (const key of ["text", "content", "output", "message", "result", "summary", "delta"]) {
    if (record[key] !== undefined) {
      const text = textFromUnknown(record[key]);
      if (text) return text;
    }
  }
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

function messageText(message: HermesMessage) {
  return textFromUnknown(message.content ?? message.text ?? message.output ?? "");
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function shortText(value: unknown, max = 220) {
  const text = textFromUnknown(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function eventActivity(type: string, payload: Record<string, unknown>): ActivityItem | null {
  const normalized = type || String(payload.type || payload.event || "event");
  const lower = normalized.toLowerCase();
  const tool = String(payload.tool_name || payload.name || asRecord(payload.tool)?.name || "tool");
  const at = new Date().toISOString();
  if (lower.includes("assistant.delta") || lower.includes("token") || lower === "message") return null;
  if (lower.includes("tool.started") || lower.includes("tool.start")) {
    return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: `${tool} started`, detail: shortText(payload.arguments ?? payload.input ?? payload.args), at, state: "live" };
  }
  if (lower.includes("tool.completed") || lower.includes("tool.complete")) {
    return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: `${tool} completed`, detail: shortText(payload.summary ?? payload.result ?? payload.output), at, state: "done" };
  }
  if (lower.includes("subagent.start")) {
    return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: "Subagent started", detail: shortText(payload.task ?? payload.summary ?? payload), at, state: "live" };
  }
  if (lower.includes("subagent.complete")) {
    return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: "Subagent completed", detail: shortText(payload.summary ?? payload), at, state: String(payload.status || "").toLowerCase() === "failed" ? "error" : "done" };
  }
  if (lower.includes("run.completed")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: "Hermes turn completed", detail: shortText(payload.output ?? payload.summary), at, state: "done" };
  if (lower.includes("run.failed") || lower.includes("error")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: "Hermes event failed", detail: shortText(payload.error ?? payload.message ?? payload), at, state: "error" };
  if (lower.includes("run.start") || lower.includes("run.created")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: "Hermes turn started", detail: shortText(payload), at, state: "live" };
  return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: normalized.replaceAll(".", " "), detail: shortText(payload), at, state: "info" };
}

function historicalActivity(messages: HermesMessage[]): ActivityItem[] {
  const result: ActivityItem[] = [];
  messages.forEach((message, index) => {
    const at = message.created_at || message.timestamp || new Date().toISOString();
    const role = String(message.role || "").toLowerCase();
    if (role === "tool" || message.tool_name || message.name) {
      const name = String(message.tool_name || message.name || "tool");
      result.push({ id: `history-tool-${message.id ?? index}`, type: "tool.history", label: name, detail: shortText(message.content ?? message.output), at, state: "done" });
    }
    if (Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach((call, callIndex) => {
        const record = asRecord(call);
        const fn = asRecord(record?.function);
        const name = String(record?.name || fn?.name || "tool call");
        result.push({ id: `history-call-${message.id ?? index}-${callIndex}`, type: "tool.call", label: name, detail: shortText(record?.arguments ?? fn?.arguments), at, state: "done" });
      });
    }
  });
  return result.slice(-80);
}

function artifactsFromText(text: string, source: ArtifactItem["source"]): ArtifactItem[] {
  const matches = text.match(artifactPattern) || [];
  return matches.map((path) => {
    const clean = path.replace(/[),.;:]+$/, "");
    const extension = clean.split(".").pop()?.toLowerCase() || "file";
    return { path: clean, kind: extension, source };
  });
}

function parseMission(raw: string, activeSessionId: string): MissionSnapshot {
  const headings = ["CURRENT OBJECTIVE", "COMPLETED", "IN PROGRESS", "NEXT", "BLOCKERS", "IMPORTANT CONTEXT"] as const;
  const values: Record<string, string> = {};
  headings.forEach((heading, index) => {
    const next = headings[index + 1];
    const pattern = new RegExp(`${heading}:\\s*([\\s\\S]*?)${next ? `(?=${next}:)` : "$"}`, "i");
    values[heading] = raw.match(pattern)?.[1]?.trim() || "Not supplied by Hermes in this snapshot.";
  });
  return {
    objective: values["CURRENT OBJECTIVE"],
    completed: values.COMPLETED,
    inProgress: values["IN PROGRESS"],
    next: values.NEXT,
    blockers: values.BLOCKERS,
    context: values["IMPORTANT CONTEXT"],
    raw,
    at: new Date().toISOString(),
    sessionId: activeSessionId,
  };
}

function StateDot({ state }: { state?: string }) {
  const clean = state || "unknown";
  return <span className={`${styles.stateDot} ${styles[`state_${clean}`] || ""}`}><i />{clean.replaceAll("_", " ").toUpperCase()}</span>;
}

export function HermesControlLayer() {
  const [environment, setEnvironment] = useState<ControlEnvironment>("production");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [sessions, setSessions] = useState<HermesSession[]>([]);
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "offline">("loading");
  const [sessionError, setSessionError] = useState("");
  const [sessionStats, setSessionStats] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [messagesBusy, setMessagesBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [mission, setMission] = useState<MissionSnapshot | null>(null);
  const [missionPending, setMissionPending] = useState(false);
  const [activeRunId, setActiveRunId] = useState("");
  const [steerText, setSteerText] = useState("");
  const [notice, setNotice] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const selectedSession = useMemo(() => sessions.find((item) => sessionId(item) === selectedId) || null, [sessions, selectedId]);
  const interactive = environment === "research";
  const profileState = environment === "research" ? status?.research : status?.production;

  const combinedActivity = useMemo(() => {
    const historical = historicalActivity(messages);
    const all = [...historical, ...activity];
    const seen = new Set<string>();
    return all.filter((item) => {
      const key = `${item.type}|${item.label}|${item.detail || ""}|${item.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-80).reverse();
  }, [activity, messages]);

  const artifacts = useMemo(() => {
    const collected: ArtifactItem[] = [];
    messages.forEach((message) => collected.push(...artifactsFromText(messageText(message), "session")));
    activity.forEach((item) => collected.push(...artifactsFromText(`${item.label} ${item.detail || ""}`, "live")));
    const seen = new Set<string>();
    return collected.filter((item) => {
      if (seen.has(item.path)) return false;
      seen.add(item.path);
      return true;
    }).slice(-40).reverse();
  }, [activity, messages]);

  async function loadStatus() {
    try {
      const [statusResponse, capabilityResponse] = await Promise.all([
        fetch("/api/brain/status", { cache: "no-store" }),
        fetch("/api/brain/capabilities", { cache: "no-store" }),
      ]);
      const statusData = await statusResponse.json();
      const capabilityData = await capabilityResponse.json();
      setStatus(statusData);
      setCapabilities(Array.isArray(capabilityData.items) ? capabilityData.items : []);
    } catch {
      setStatus(null);
      setCapabilities([]);
    }
  }

  async function loadSessions(targetEnvironment = environment, query = search) {
    setSessionState("loading");
    setSessionError("");
    try {
      const params = new URLSearchParams({ environment: targetEnvironment, limit: "60" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/brain/sessions?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${targetEnvironment} sessions unavailable`);
      const items = extractSessions(data);
      setSessions(items);
      setSessionState("ready");
      const currentStillExists = items.some((item) => sessionId(item) === selectedId);
      if (!currentStillExists) setSelectedId(items[0] ? sessionId(items[0]) : "");
    } catch (error) {
      setSessions([]);
      setSelectedId("");
      setSessionState("offline");
      setSessionError(error instanceof Error ? error.message : "Sessions unavailable");
    }
  }

  async function loadStats(targetEnvironment = environment) {
    try {
      const response = await fetch(`/api/brain/sessions/stats?environment=${targetEnvironment}`, { cache: "no-store" });
      const data = await response.json();
      setSessionStats(response.ok ? (asRecord(unwrap(data)) || asRecord(data)) : null);
    } catch { setSessionStats(null); }
  }

  async function loadMessages(id = selectedId, targetEnvironment = environment) {
    if (!id) { setMessages([]); return; }
    setMessagesBusy(true);
    try {
      const response = await fetch(`/api/brain/sessions/${encodeURIComponent(id)}/messages?environment=${targetEnvironment}&limit=500&order=oldest`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Session history unavailable");
      setMessages(extractMessages(data));
    } catch (error) {
      setMessages([]);
      setNotice(error instanceof Error ? error.message : "Unable to load session history");
    } finally {
      setMessagesBusy(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    setSearch("");
    setMessages([]);
    setActivity([]);
    setStreamText("");
    setMission(null);
    loadSessions(environment, "");
    loadStats(environment);
  }, [environment]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setMission(null); return; }
    loadMessages(selectedId, environment);
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(`hermes-mission:${environment}:${selectedId}`);
        setMission(cached ? JSON.parse(cached) as MissionSnapshot : null);
      } catch { setMission(null); }
    }
  }, [selectedId, environment]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: streaming ? "smooth" : "auto", block: "end" });
  }, [messages, streamText, streaming]);

  async function createResearchSession(title?: string) {
    const response = await fetch("/api/brain/sessions?environment=research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || `Brain Studio ${new Date().toLocaleDateString("en-GB")}` }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to create research session");
    const created = extractSession(data);
    await loadSessions("research", "");
    const id = sessionId(created);
    if (id) setSelectedId(id);
    return id;
  }

  async function ensureResearchSession() {
    if (environment !== "research") setEnvironment("research");
    if (environment === "research" && selectedId) return selectedId;
    return createResearchSession();
  }

  function appendActivity(item: ActivityItem | null) {
    if (!item) return;
    setActivity((current) => [...current.slice(-79), item]);
  }

  function parseEventBlock(block: string, onDelta: (value: string) => void, onComplete: (value: string) => void) {
    const lines = block.split(/\r?\n/);
    let eventName = "";
    const dataLines: string[] = [];
    lines.forEach((line) => {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    });
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    if (raw === "[DONE]") return;
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { payload = { text: raw }; }
    const type = eventName || String(payload.type || payload.event || "message");
    const runId = payload.run_id || payload.runId || payload.id;
    if (typeof runId === "string" && runId.startsWith("run_")) setActiveRunId(runId);

    const lower = type.toLowerCase();
    if (lower.includes("assistant.delta")) {
      const delta = textFromUnknown(payload.delta ?? payload.text ?? payload.content);
      if (delta) onDelta(delta);
    } else if (lower.includes("run.completed")) {
      const output = textFromUnknown(payload.output ?? payload.text ?? payload.content);
      if (output) onComplete(output);
    } else if (lower === "message" && typeof payload.text === "string") {
      onDelta(payload.text);
    }
    appendActivity(eventActivity(type, payload));
  }

  async function sendToHermes(input: string, options?: { mission?: boolean }) {
    const clean = input.trim();
    if (!clean || streaming) return;
    if (!interactive) {
      setNotice("his-production is read-only in Brain Studio. Switch to Research to continue or change Hermes work.");
      return;
    }

    let id = selectedId;
    if (!id) {
      try { id = await createResearchSession(); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create research session"); return; }
    }
    if (!id) return;

    const optimistic: HermesMessage = { id: `local-${Date.now()}`, role: "user", content: clean, created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setStreaming(true);
    setStreamText("");
    setActiveRunId("");
    if (options?.mission) setMissionPending(true);
    appendActivity({ id: `turn-${Date.now()}`, type: "turn.start", label: "Instruction sent to Hermes", detail: shortText(clean, 160), at: new Date().toISOString(), state: "live" });

    let finalText = "";
    try {
      const response = await fetch(`/api/brain/sessions/${encodeURIComponent(id)}/chat/stream?environment=research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: clean }),
      });
      if (!response.ok || !response.body) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Hermes returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      const appendDelta = (delta: string) => {
        assistantText += delta;
        setStreamText(assistantText);
      };
      const complete = (output: string) => {
        if (!assistantText.trim()) {
          assistantText = output;
          setStreamText(output);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          const delimiterMatch = buffer.slice(boundary).match(/^\r?\n\r?\n/);
          buffer = buffer.slice(boundary + (delimiterMatch?.[0].length || 2));
          this;
          parseEventBlock(block, appendDelta, complete);
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      }
      if (buffer.trim()) parseEventBlock(buffer, appendDelta, complete);
      finalText = assistantText.trim();
      if (finalText) {
        setMessages((current) => [...current, { id: `stream-${Date.now()}`, role: "assistant", content: finalText, created_at: new Date().toISOString() }]);
      }
      if (options?.mission && finalText) {
        const snapshot = parseMission(finalText, id);
        setMission(snapshot);
        try { window.localStorage.setItem(`hermes-mission:research:${id}`, JSON.stringify(snapshot)); } catch { /* cache is optional */ }
      }
    } catch (error) {
      appendActivity({ id: `error-${Date.now()}`, type: "turn.error", label: "Hermes connection error", detail: error instanceof Error ? error.message : "Unknown stream error", at: new Date().toISOString(), state: "error" });
      setNotice(error instanceof Error ? error.message : "Hermes stream failed");
    } finally {
      setStreaming(false);
      setStreamText("");
      setMissionPending(false);
      setActiveRunId("");
      await loadMessages(id, "research");
      await loadSessions("research", "");
      await loadStats("research");
    }
  }

  async function newSession() {
    if (environment !== "research") setEnvironment("research");
    try {
      const id = await createResearchSession();
      if (id) setNotice("New his-research session created.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create session"); }
  }

  async function forkSession() {
    if (!selectedId || !interactive) return;
    try {
      const response = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}/fork?environment=research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${selectedSession?.title || "Research"} — branch` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to fork session");
      const forked = extractSession(data);
      await loadSessions("research", "");
      const id = sessionId(forked);
      if (id) setSelectedId(id);
      setNotice("Research session forked. Original remains unchanged.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to fork session"); }
  }

  async function renameSession() {
    if (!selectedId || !interactive || !renameValue.trim()) return;
    try {
      const response = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}?environment=research`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to rename session");
      setRenameOpen(false);
      await loadSessions("research", "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to rename session"); }
  }

  async function exportSession() {
    if (!selectedId) return;
    try {
      const response = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}/export?environment=${environment}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Export failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hermes-${environment}-${selectedId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to export session"); }
  }

  async function stopRun() {
    if (!activeRunId) return;
    try {
      const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeRunId)}/stop?environment=research`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Stop request failed");
      appendActivity({ id: `stop-${Date.now()}`, type: "run.stop", label: "Stop requested", detail: activeRunId, at: new Date().toISOString(), state: "info" });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to stop run"); }
  }

  async function steerRun() {
    if (!activeRunId || !steerText.trim()) return;
    try {
      const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeRunId)}/steer?environment=research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: steerText.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Steer request failed");
      appendActivity({ id: `steer-${Date.now()}`, type: "run.steer", label: "Mid-run guidance queued", detail: steerText.trim(), at: new Date().toISOString(), state: "info" });
      setSteerText("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to steer run"); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    sendToHermes(draft);
  }

  const skills = capabilities.filter((item) => item.type === "skill");
  const toolsets = capabilities.filter((item) => item.type === "toolset");
  const statTotal = sessionStats ? Number(sessionStats.total_sessions ?? sessionStats.total ?? sessionStats.sessions ?? 0) : 0;

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span>H</span><div><strong>HERMES</strong><small>INVESTMENT OS</small></div></Link>
      <nav>
        <span>OPERATIONS</span>
        <Link href="/">Command Center</Link>
        <span>INTELLIGENCE</span>
        <div className={styles.activeNav}>Hermes Control <b>v0.3.1</b></div>
        <Link href="/brain/lab">Improvement Lab</Link>
        <a href="#mission">Current Plan</a>
        <a href="#activity">Activity</a>
        <a href="#artifacts">Artifacts</a>
      </nav>
      <div className={styles.safetyCard}><span>HARD BOUNDARY</span><strong>EXECUTION OUTSIDE BRAIN</strong><p>Research can think, use tools and continue its own plan. Production sessions remain inspect-only here.</p></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>HERMES-NATIVE CONTROL PLANE</span><h1>Hermes Control</h1><p>The OS is the cockpit. Hermes remains the source of truth for its plan, sessions, research, backtests, skills and investment structure.</p></div>
        <div className={styles.headerActions}><button onClick={() => { loadStatus(); loadSessions(); loadStats(); if (selectedId) loadMessages(); }}>REFRESH</button><Link href="/brain/lab">OPEN IMPROVEMENT LAB</Link></div>
      </header>

      {notice && <div className={styles.notice}><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

      <section className={styles.statusStrip}>
        <div><span>PRODUCTION</span><StateDot state={status?.production.state} /><small>his-production · inspect</small></div>
        <div><span>RESEARCH</span><StateDot state={status?.research.state} /><small>his-research · interactive</small></div>
        <div><span>SKILLS</span><strong>{status?.skills.state === "connected" ? skills.length : "—"}</strong><small>Hermes-reported only</small></div>
        <div><span>TOOLSETS</span><strong>{status?.toolsets.state === "connected" ? toolsets.length : "—"}</strong><small>Hermes-reported only</small></div>
        <div><span>SESSIONS</span><strong>{statTotal || (sessionState === "ready" ? sessions.length : "—")}</strong><small>{environment}</small></div>
        <div><span>BROKER EXECUTION</span><strong className={styles.locked}>LOCKED</strong><small>not owned by Brain Studio</small></div>
      </section>

      <section className={styles.modeBar}>
        <div><button className={environment === "production" ? styles.modeActive : ""} onClick={() => setEnvironment("production")}><span>his-production</span><small>Existing Hermes work · read only</small></button><button className={environment === "research" ? styles.modeActive : ""} onClick={() => setEnvironment("research")}><span>his-research</span><small>Continue, research and build intelligence</small></button></div>
        <p>{interactive ? "Interactive turns are persisted by Hermes in the selected research session." : "Browse the Hermes sessions you already built. Agent turns are intentionally blocked on production from this UI."}</p>
      </section>

      <div className={styles.controlGrid}>
        <aside className={styles.sessionRail}>
          <div className={styles.railHead}><div><span className={styles.eyebrow}>HERMES SESSIONS</span><h2>{interactive ? "Research workspace" : "Existing workspace"}</h2></div>{interactive && <button onClick={newSession}>＋</button>}</div>
          <form className={styles.searchBox} onSubmit={(event) => { event.preventDefault(); loadSessions(environment, search); }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search session content…" /><button>⌕</button></form>
          {search && <button className={styles.clearSearch} onClick={() => { setSearch(""); loadSessions(environment, ""); }}>Clear search</button>}
          <div className={styles.sessionList}>
            {sessionState === "loading" && <div className={styles.railEmpty}>Loading Hermes sessions…</div>}
            {sessionState === "offline" && <div className={styles.railEmpty}><strong>Session API unavailable</strong><span>{sessionError}</span></div>}
            {sessionState === "ready" && sessions.length === 0 && <div className={styles.railEmpty}><strong>No sessions returned</strong><span>{search ? "No matching Hermes session." : "Hermes did not return sessions for this profile."}</span></div>}
            {sessions.map((session, index) => {
              const id = sessionId(session);
              const title = session.title || session.preview || `Session ${index + 1}`;
              return <button key={id || index} className={selectedId === id ? styles.sessionActive : ""} onClick={() => setSelectedId(id)}><div><strong>{String(title)}</strong>{session.active && <i>LIVE</i>}</div><p>{session.preview || session.source || id}</p><footer><span>{session.model || session.source || "Hermes"}</span><time>{formatTime(session.updated_at || session.started_at || session.created_at)}</time></footer></button>;
            })}
          </div>
          <div className={styles.sessionFoot}><span>{environment === "production" ? "READ ONLY SOURCE" : "HERMES PERSISTED"}</span><small>{selectedId || "No session selected"}</small></div>
        </aside>

        <section className={styles.chatPanel}>
          <div className={styles.chatHead}>
            <div><span className={styles.eyebrow}>{interactive ? "LIVE HERMES WORKSPACE" : "SESSION INSPECTOR"}</span><h2>{selectedSession?.title || selectedSession?.preview || (selectedId ? selectedId : "Select a Hermes session")}</h2><p>{selectedId ? `${environment} · ${selectedSession?.model || "Hermes"} · ${messages.length} loaded messages` : "Choose a persisted session on the left."}</p></div>
            <div className={styles.sessionActions}><button disabled={!selectedId} onClick={exportSession}>EXPORT</button>{interactive && <><button disabled={!selectedId} onClick={() => { setRenameValue(String(selectedSession?.title || "")); setRenameOpen(true); }}>RENAME</button><button disabled={!selectedId} onClick={forkSession}>FORK</button></>}</div>
          </div>

          {interactive && <div className={styles.quickRow}>{quickActions.map((action) => <button key={action.label} disabled={streaming} onClick={() => sendToHermes(action.prompt)}>{action.label}</button>)}</div>}

          <div className={styles.thread}>
            {!selectedId && <div className={styles.threadEmpty}><span>H</span><h3>Open Hermes exactly where it left off.</h3><p>Select a production session to inspect your existing work, or switch to Research and create/select a session to continue Hermes' own plan.</p></div>}
            {selectedId && messagesBusy && messages.length === 0 && <div className={styles.threadEmpty}><p>Loading full Hermes history…</p></div>}
            {messages.map((message, index) => {
              const role = String(message.role || "unknown").toLowerCase();
              const text = messageText(message);
              return <article key={String(message.id ?? index)} className={`${styles.message} ${styles[`role_${role}`] || ""}`}><header><strong>{role === "assistant" ? "HERMES" : role === "user" ? "YOU" : role.toUpperCase()}</strong><div>{message.tool_name && <span>{message.tool_name}</span>}<time>{formatTime(message.created_at || message.timestamp)}</time></div></header><pre>{text || (Array.isArray(message.tool_calls) ? "Tool call recorded by Hermes." : "No textual content")}</pre>{Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && <details><summary>{message.tool_calls.length} tool call{message.tool_calls.length === 1 ? "" : "s"}</summary><code>{JSON.stringify(message.tool_calls, null, 2)}</code></details>}</article>;
            })}
            {streaming && <article className={`${styles.message} ${styles.role_assistant} ${styles.liveMessage}`}><header><strong>HERMES · LIVE</strong><div><span className={styles.livePulse}>WORKING</span>{activeRunId && <time>{activeRunId}</time>}</div></header><pre>{streamText || "Hermes is using its tools…"}</pre></article>}
            <div ref={threadEndRef} />
          </div>

          {interactive ? <>
            {streaming && <div className={styles.runControls}><div><strong>LIVE TURN</strong><span>{activeRunId || "Hermes session stream active"}</span></div>{activeRunId && <><input value={steerText} onChange={(event) => setSteerText(event.target.value)} placeholder="Steer at next tool boundary…" /><button disabled={!steerText.trim()} onClick={steerRun}>STEER</button><button className={styles.stopButton} onClick={stopRun}>STOP</button></>}</div>}
            <form className={styles.composer} onSubmit={submit}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} placeholder={selectedId ? "Give Hermes an instruction exactly as you would in Hermes itself…" : "Create/select a research session, then instruct Hermes…"} /><div><span>Full Hermes tools + persisted session context. Production execution stays outside this interface.</span><button disabled={streaming || !draft.trim()}>{streaming ? "HERMES WORKING" : "SEND TO HERMES"}</button></div></form>
          </> : <div className={styles.readOnlyBar}><div><strong>PRODUCTION SESSION — READ ONLY</strong><span>This lets you inspect the plan, backtests and structure you already built without giving this browser a production mutation path.</span></div><button onClick={() => setEnvironment("research")}>SWITCH TO RESEARCH →</button></div>}
        </section>

        <aside className={styles.intelligenceRail}>
          <section id="mission" className={styles.railCard}>
            <header><div><span className={styles.eyebrow}>CURRENT PLAN</span><h2>Mission Control</h2></div>{interactive && <button disabled={streaming || missionPending} onClick={() => sendToHermes(MISSION_PROMPT, { mission: true })}>{missionPending ? "…" : "↻"}</button>}</header>
            {!interactive && <div className={styles.cardEmpty}><strong>Hermes summary requires Research.</strong><p>Use production session history as the source view. Tonight, connect/migrate his-research and let Hermes summarize its own plan there.</p></div>}
            {interactive && !mission && <div className={styles.cardEmpty}><strong>No cached Hermes plan snapshot.</strong><p>Refresh to make Hermes inspect its own sessions, memory, files and recent work. The OS will not invent this state.</p></div>}
            {mission && <div className={styles.missionGrid}>
              <div className={styles.missionPrimary}><span>CURRENT OBJECTIVE</span><p>{mission.objective}</p></div>
              <div><span>IN PROGRESS</span><p>{mission.inProgress}</p></div>
              <div><span>NEXT</span><p>{mission.next}</p></div>
              <div><span>BLOCKERS</span><p>{mission.blockers}</p></div>
              <details><summary>Completed & context</summary><h4>COMPLETED</h4><p>{mission.completed}</p><h4>IMPORTANT CONTEXT</h4><p>{mission.context}</p></details>
              <small>Hermes snapshot · {formatTime(mission.at)}</small>
            </div>}
          </section>

          <section id="activity" className={styles.railCard}>
            <header><div><span className={styles.eyebrow}>AGENT ACTIVITY</span><h2>What Hermes is doing</h2></div><b>{combinedActivity.length}</b></header>
            <div className={styles.activityList}>{combinedActivity.length === 0 ? <div className={styles.cardEmpty}><strong>No tool activity loaded.</strong><p>Historical tool calls appear from session messages; new turns stream live events here.</p></div> : combinedActivity.slice(0, 18).map((item) => <article key={item.id} className={styles[`activity_${item.state}`]}><i /><div><strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}<time>{formatTime(item.at)}</time></div></article>)}</div>
          </section>

          <section id="artifacts" className={styles.railCard}>
            <header><div><span className={styles.eyebrow}>ARTIFACTS</span><h2>Outputs detected in Hermes</h2></div><b>{artifacts.length}</b></header>
            {artifacts.length === 0 ? <div className={styles.cardEmpty}><strong>No artifact paths detected.</strong><p>This view only shows paths actually present in Hermes transcripts/tool events. It does not fabricate workspace files.</p></div> : <div className={styles.artifactList}>{artifacts.slice(0, 14).map((artifact) => <div key={artifact.path}><span>{artifact.kind.toUpperCase()}</span><code>{artifact.path}</code><small>{artifact.source}</small></div>)}</div>}
          </section>

          <section className={styles.railCard}>
            <header><div><span className={styles.eyebrow}>BRAIN INVENTORY</span><h2>Hermes-reported capabilities</h2></div><Link href="/brain/lab">LAB</Link></header>
            <div className={styles.inventory}><div><strong>{status?.skills.state === "connected" ? skills.length : "—"}</strong><span>skills</span></div><div><strong>{status?.toolsets.state === "connected" ? toolsets.length : "—"}</strong><span>toolsets</span></div></div>
            <div className={styles.inventoryList}>{capabilities.slice(0, 8).map((item) => <div key={item.id}><span>{item.type}</span><strong>{item.name}</strong></div>)}</div>
            {capabilities.length === 0 && <div className={styles.cardEmpty}><p>Capability endpoints are unavailable or not connected.</p></div>}
          </section>
        </aside>
      </div>
    </main>

    {renameOpen && <div className={styles.modalBackdrop} onMouseDown={() => setRenameOpen(false)}><div className={styles.modal} onMouseDown={(event) => event.stopPropagation()}><span className={styles.eyebrow}>RENAME RESEARCH SESSION</span><h2>Session title</h2><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameSession(); }} /><div><button onClick={() => setRenameOpen(false)}>CANCEL</button><button disabled={!renameValue.trim()} onClick={renameSession}>SAVE</button></div></div></div>}
  </div>;
}