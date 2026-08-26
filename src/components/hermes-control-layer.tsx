"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BrainStatus, CapabilityItem } from "@/lib/brain/types";
import styles from "./hermes-control-layer.module.css";

type ControlEnvironment = "research" | "production";
type ControlView = "overview" | "chat" | "work" | "library";

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

type PendingResearchAction = {
  prompt: string;
  mission?: boolean;
};

const quickActions = [
  {
    label: "Continue current plan",
    shortLabel: "Continue",
    prompt: "Ga verder met het hoogste-prioriteit unfinished item uit je bestaande investment-system plan. Inspecteer eerst je relevante persisted sessions, memory, project files en recente outputs. Vertel kort wat je hervat en waarom, en ga daarna daadwerkelijk verder. Verander geen broker execution-instellingen of harde risk limits zonder expliciete menselijke approval.",
  },
  {
    label: "What are you working on?",
    shortLabel: "Current work",
    prompt: "Vertel kort waar je momenteel daadwerkelijk aan werkt binnen je bestaande investment-system plan, wat het concrete doel is en wat je eerstvolgende stap is. Baseer dit op persisted state; verzin niets.",
  },
  {
    label: "Review latest backtest",
    shortLabel: "Latest backtest",
    prompt: "Zoek je meest recente relevante backtest of backtestanalyse in je eigen workspace/sessions. Review de resultaten, methodologie, sample size, mogelijke leakage/overfitting en de openstaande vervolgstap volgens je bestaande plan. Als je geen betrouwbare backtest kunt vinden, zeg dat expliciet.",
  },
  {
    label: "What do you need from me?",
    shortLabel: "Needs me",
    prompt: "Inspecteer je huidige investment-system plan en werkstatus. Geef alleen de echte blockers of beslissingen waarvoor je input, toegang of approval van mij nodig hebt. Benoem ook expliciet als je niets van mij nodig hebt. Gebruik bestaande state en bewijs; verzin niets.",
  },
  {
    label: "Review your progress",
    shortLabel: "Progress",
    prompt: "Review je eigen voortgang als investment system. Gebruik je persisted plan, recente sessions, research, backtests en gemaakte artifacts. Benoem wat aantoonbaar af is, wat half-af is, wat niet werkt en wat nu de hoogste leverage vervolgstap is. Maak geen nieuwe roadmap als er al een bestaande roadmap is; werk vanuit je bestaande plan.",
  },
  {
    label: "Find weakest capability",
    shortLabel: "Weakest capability",
    prompt: "Inspecteer je huidige investment capabilities en bestaand bewijs. Identificeer de zwakste capability die aantoonbaar de meeste performance of betrouwbaarheid kost. Gebruik je eigen bestaande plan en eerdere tests. Stel alleen een wijziging voor als het bewijs dat ondersteunt; verander production niet stilzwijgend.",
  },
];

const MISSION_PROMPT = `Maak een actuele snapshot van je EIGEN bestaande investment-system plan. Inspecteer daarvoor je persisted sessions, memory, relevante project files, recente research/backtests en openstaande taken. Baseer je antwoord op wat werkelijk bestaat; verzin niets en ontwerp geen nieuwe roadmap als er al een plan bestaat.

Gebruik exact deze headings en vul ze concreet in:
CURRENT OBJECTIVE:
COMPLETED:
IN PROGRESS:
NEXT:
BLOCKERS:
IMPORTANT CONTEXT:

Als informatie ontbreekt, zet dat onder de relevante heading. Verander geen broker execution-instellingen of harde risk limits.`;

const artifactPattern = /(?:~\/|\/)[^\s\n\r\t"'`<>]+?\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|odt|rtf|txt|md|epub|xlsx?|ods|csv|tsv|json|xml|ya?ml|pptx?|odp|key|zip|tar|gz|tgz|html?)(?=$|[\s\n\r\t"'`<>),.;:])/gi;

const fileTypeNames: Record<string, string> = {
  md: "Research note",
  txt: "Text note",
  pdf: "PDF report",
  csv: "Dataset",
  tsv: "Dataset",
  xls: "Spreadsheet",
  xlsx: "Spreadsheet",
  ods: "Spreadsheet",
  json: "Structured data",
  yaml: "Configuration",
  yml: "Configuration",
  xml: "Structured data",
  doc: "Document",
  docx: "Document",
  ppt: "Presentation",
  pptx: "Presentation",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  gif: "Image",
  webp: "Image",
  svg: "Image",
  html: "Web document",
  htm: "Web document",
  zip: "Archive",
};

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

function humanizeName(value: string) {
  return value
    .replace(/^tool[._-]?/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function humanActivityLabel(type: string, tool?: string) {
  const lower = type.toLowerCase();
  const name = tool ? humanizeName(tool) : "";
  if (lower.includes("tool.start")) return name ? `Using ${name}` : "Using a tool";
  if (lower.includes("tool.complete")) return name ? `Finished ${name}` : "Finished a tool step";
  if (lower.includes("subagent.start")) return "Delegated part of the work";
  if (lower.includes("subagent.complete")) return "Delegated work completed";
  if (lower.includes("run.completed")) return "Hermes finished a work step";
  if (lower.includes("run.failed") || lower.includes("error")) return "A Hermes step failed";
  if (lower.includes("run.start") || lower.includes("run.created")) return "Hermes started working";
  return humanizeName(type);
}

function eventActivity(type: string, payload: Record<string, unknown>): ActivityItem | null {
  const normalized = type || String(payload.type || payload.event || "event");
  const lower = normalized.toLowerCase();
  const tool = String(payload.tool_name || payload.name || asRecord(payload.tool)?.name || "");
  const at = new Date().toISOString();
  if (lower.includes("assistant.delta") || lower.includes("token") || lower === "message") return null;
  if (lower.includes("tool.started") || lower.includes("tool.start")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("tool.start", tool), detail: shortText(payload.arguments ?? payload.input ?? payload.args), at, state: "live" };
  if (lower.includes("tool.completed") || lower.includes("tool.complete")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("tool.complete", tool), detail: shortText(payload.summary ?? payload.result ?? payload.output), at, state: "done" };
  if (lower.includes("subagent.start")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("subagent.start"), detail: shortText(payload.task ?? payload.summary ?? payload), at, state: "live" };
  if (lower.includes("subagent.complete")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("subagent.complete"), detail: shortText(payload.summary ?? payload), at, state: String(payload.status || "").toLowerCase() === "failed" ? "error" : "done" };
  if (lower.includes("run.completed")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("run.completed"), detail: shortText(payload.output ?? payload.summary), at, state: "done" };
  if (lower.includes("run.failed") || lower.includes("error")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("run.failed"), detail: shortText(payload.error ?? payload.message ?? payload), at, state: "error" };
  if (lower.includes("run.start") || lower.includes("run.created")) return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel("run.start"), detail: shortText(payload), at, state: "live" };
  return { id: `${Date.now()}-${Math.random()}`, type: normalized, label: humanActivityLabel(normalized, tool), detail: shortText(payload), at, state: "info" };
}

function historicalActivity(messages: HermesMessage[]): ActivityItem[] {
  const result: ActivityItem[] = [];
  messages.forEach((message, index) => {
    const at = message.created_at || message.timestamp || new Date().toISOString();
    const role = String(message.role || "").toLowerCase();
    if (role === "tool" || message.tool_name || message.name) {
      const name = String(message.tool_name || message.name || "tool");
      result.push({ id: `history-tool-${message.id ?? index}`, type: "tool.history", label: `Used ${humanizeName(name)}`, detail: shortText(message.content ?? message.output), at, state: "done" });
    }
    if (Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach((call, callIndex) => {
        const record = asRecord(call);
        const fn = asRecord(record?.function);
        const name = String(record?.name || fn?.name || "tool");
        result.push({ id: `history-call-${message.id ?? index}-${callIndex}`, type: "tool.call", label: `Used ${humanizeName(name)}`, detail: shortText(record?.arguments ?? fn?.arguments), at, state: "done" });
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

function artifactName(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function artifactType(kind: string) {
  return fileTypeNames[kind.toLowerCase()] || `${kind.toUpperCase()} file`;
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

function friendlyError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (lower.includes("not configured") || lower.includes("is not connected")) return "This Hermes workspace isn't connected yet.";
  if (lower.includes("401") || lower.includes("403") || lower.includes("auth")) return "Hermes couldn't authenticate this workspace.";
  if (lower.includes("502") || lower.includes("503") || lower.includes("gateway") || lower.includes("unavailable") || lower.includes("offline")) return "Hermes is temporarily unavailable.";
  if (lower.includes("timeout") || lower.includes("abort")) return "Hermes took too long to respond.";
  return fallback;
}

function blockerState(mission: MissionSnapshot | null) {
  if (!mission) return { kind: "unknown" as const, title: "Needs you is unknown", body: "Refresh the current plan to let Hermes report whether it needs input from you." };
  const raw = mission.blockers.trim();
  const lower = raw.toLowerCase();
  if (!raw || /^(none|geen|n\/a|no blockers?|nothing needed|geen blockers?)[.!]?$/i.test(raw) || lower.includes("no blockers")) {
    return { kind: "clear" as const, title: "Nothing needed from you", body: "Hermes reported no current blockers in the latest plan snapshot." };
  }
  return { kind: "needs" as const, title: "Hermes may need your input", body: raw };
}

function workStatus(streaming: boolean, sessions: HermesSession[], sessionState: string) {
  if (streaming || sessions.some((session) => session.active)) return { label: "Working", tone: "working" };
  if (sessionState === "offline") return { label: "Unavailable", tone: "error" };
  return { label: "Idle", tone: "idle" };
}

function groupActivity(items: ActivityItem[]) {
  const groups: { id: string; title: string; start: string; end: string; state: ActivityItem["state"]; items: ActivityItem[] }[] = [];
  items.forEach((item) => {
    const previous = groups[groups.length - 1];
    const time = new Date(item.at).getTime();
    const previousTime = previous ? new Date(previous.start).getTime() : 0;
    const closeInTime = previous && Number.isFinite(time) && Number.isFinite(previousTime) && Math.abs(previousTime - time) <= 3 * 60 * 1000;
    const sameState = previous && previous.state === item.state;
    if (previous && closeInTime && sameState && previous.items.length < 6) {
      previous.items.push(item);
      previous.end = item.at;
      if (item.state === "live") previous.title = "Hermes is working";
      else if (previous.items.some((entry) => entry.type.toLowerCase().includes("tool"))) previous.title = "Research and tool activity";
    } else {
      groups.push({
        id: item.id,
        title: item.state === "live" ? "Hermes is working" : item.type.toLowerCase().includes("tool") ? "Research and tool activity" : item.label,
        start: item.at,
        end: item.at,
        state: item.state,
        items: [item],
      });
    }
  });
  return groups;
}

function focusTrap(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const root = event.currentTarget;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ConnectionBadge({ state }: { state?: string }) {
  const clean = state || "loading";
  const label = clean === "connected" ? "Connected" : clean === "not_configured" ? "Not connected" : clean === "auth_error" ? "Authentication issue" : clean === "offline" ? "Offline" : clean === "degraded" ? "Degraded" : "Checking";
  return <span className={`${styles.connectionBadge} ${styles[`connection_${clean}`] || ""}`}><i />{label}</span>;
}

function EnvironmentSwitch({ environment, onChange }: { environment: ControlEnvironment; onChange: (value: ControlEnvironment) => void }) {
  return <div className={styles.environmentSwitch} aria-label="Hermes environment">
    <button type="button" aria-pressed={environment === "research"} className={environment === "research" ? styles.environmentActive : ""} onClick={() => onChange("research")} title="Safe workspace for research and development">Research</button>
    <button type="button" aria-pressed={environment === "production"} className={environment === "production" ? `${styles.environmentActive} ${styles.productionActive}` : ""} onClick={() => onChange("production")} title="Approved Hermes investment brain. Read-only from Hermes Control">Production</button>
  </div>;
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className={styles.sectionHeading}><div>{eyebrow && <span>{eyebrow}</span>}<h2>{title}</h2></div>{action}</div>;
}

export function HermesControlLayer() {
  const [view, setView] = useState<ControlView>("overview");
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
  const [lastTechnicalError, setLastTechnicalError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingResearchAction | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSession = useMemo(() => sessions.find((item) => sessionId(item) === selectedId) || null, [sessions, selectedId]);
  const interactive = environment === "research";
  const environmentState = environment === "research" ? status?.research.state : status?.production.state;

  const combinedActivity = useMemo(() => {
    const all = [...historicalActivity(messages), ...activity];
    const seen = new Set<string>();
    return all.filter((item) => {
      const key = `${item.type}|${item.label}|${item.detail || ""}|${item.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(-80).reverse();
  }, [activity, messages]);

  const activityGroups = useMemo(() => groupActivity(combinedActivity), [combinedActivity]);

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

  const filteredArtifacts = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((artifact) => `${artifactName(artifact.path)} ${artifact.path} ${artifactType(artifact.kind)}`.toLowerCase().includes(q));
  }, [artifacts, commandQuery]);

  const filteredSessionsForCommand = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return sessions.slice(0, 5);
    return sessions.filter((session) => `${session.title || ""} ${session.preview || ""}`.toLowerCase().includes(q)).slice(0, 8);
  }, [sessions, commandQuery]);

  const skills = capabilities.filter((item) => item.type === "skill");
  const toolsets = capabilities.filter((item) => item.type === "toolset");
  const statTotal = sessionStats ? Number(sessionStats.total_sessions ?? sessionStats.total ?? sessionStats.sessions ?? 0) : 0;
  const currentWork = workStatus(streaming, sessions, sessionState);
  const needsYou = blockerState(mission);

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
      if (!response.ok) throw new Error(data.error || `${targetEnvironment} conversations unavailable`);
      const items = extractSessions(data);
      setSessions(items);
      setSessionState("ready");
      const currentStillExists = items.some((item) => sessionId(item) === selectedId);
      if (!currentStillExists) setSelectedId(items[0] ? sessionId(items[0]) : "");
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error || "");
      setLastTechnicalError(raw);
      setSessions([]);
      setSelectedId("");
      setSessionState("offline");
      setSessionError(friendlyError(error, "Conversations couldn't be loaded."));
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
      if (!response.ok) throw new Error(data.error || "Conversation history unavailable");
      setMessages(extractMessages(data));
    } catch (error) {
      setLastTechnicalError(error instanceof Error ? error.message : String(error || ""));
      setMessages([]);
      setNotice(friendlyError(error, "Conversation history couldn't be loaded."));
    } finally {
      setMessagesBusy(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

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

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setSessionDrawerOpen(false);
        setDetailsOpen(false);
        setRenameOpen(false);
        setSelectedArtifact(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (commandOpen) window.setTimeout(() => commandInputRef.current?.focus(), 0);
    else setCommandQuery("");
  }, [commandOpen]);

  useEffect(() => {
    if (!sessionDrawerOpen && search) {
      setSearch("");
      void loadSessions(environment, "");
    }
  }, [sessionDrawerOpen]);

  useEffect(() => {
    if (!pendingAction || environment !== "research" || sessionState === "loading") return;
    const action = pendingAction;
    setPendingAction(null);
    if (sessionState === "offline") {
      setDraft(action.prompt);
      setView("chat");
      setNotice("Research workspace isn't connected yet. Your instruction is ready in the composer.");
      return;
    }
    void sendToHermes(action.prompt, { mission: action.mission });
  }, [pendingAction, environment, sessionState]);

  async function createResearchSession(title?: string) {
    const response = await fetch("/api/brain/sessions?environment=research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || `Conversation ${new Date().toLocaleDateString("en-GB")}` }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to create a conversation");
    const created = extractSession(data);
    await loadSessions("research", "");
    const id = sessionId(created);
    if (id) setSelectedId(id);
    return id;
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
      setNotice("Production is protected and read-only here. Continue in Research to work with Hermes.");
      return;
    }

    let id = selectedId;
    if (!id) {
      try { id = await createResearchSession(); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create a conversation"); return; }
    }
    if (!id) return;

    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content: clean, created_at: new Date().toISOString() }]);
    setDraft("");
    setStreaming(true);
    setStreamText("");
    setActiveRunId("");
    if (options?.mission) setMissionPending(true);
    appendActivity({ id: `turn-${Date.now()}`, type: "turn.start", label: "Instruction sent to Hermes", detail: shortText(clean, 160), at: new Date().toISOString(), state: "live" });

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
          parseEventBlock(block, appendDelta, complete);
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      }
      if (buffer.trim()) parseEventBlock(buffer, appendDelta, complete);
      const finalText = assistantText.trim();
      if (finalText) setMessages((current) => [...current, { id: `stream-${Date.now()}`, role: "assistant", content: finalText, created_at: new Date().toISOString() }]);
      if (options?.mission && finalText) {
        const snapshot = parseMission(finalText, id);
        setMission(snapshot);
        try { window.localStorage.setItem(`hermes-mission:research:${id}`, JSON.stringify(snapshot)); } catch { /* optional cache */ }
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Unknown stream error";
      setLastTechnicalError(raw);
      appendActivity({ id: `error-${Date.now()}`, type: "turn.error", label: "Hermes connection error", detail: raw, at: new Date().toISOString(), state: "error" });
      setNotice(friendlyError(error, "Hermes couldn't complete that request."));
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
    if (environment !== "research") {
      setEnvironment("research");
      setView("chat");
      return;
    }
    try {
      const id = await createResearchSession();
      if (id) {
        setSessionDrawerOpen(false);
        setNotice("New conversation created.");
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create a conversation"); }
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
      if (!response.ok) throw new Error(data.error || "Unable to branch conversation");
      const forked = extractSession(data);
      await loadSessions("research", "");
      const id = sessionId(forked);
      if (id) setSelectedId(id);
      setNotice("Conversation branched. The original is unchanged.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to branch conversation"); }
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
      if (!response.ok) throw new Error(data.error || "Unable to rename conversation");
      setRenameOpen(false);
      await loadSessions("research", "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to rename conversation"); }
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
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to export conversation"); }
  }

  async function stopRun() {
    if (!activeRunId) return;
    try {
      const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeRunId)}/stop?environment=research`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Stop request failed");
      appendActivity({ id: `stop-${Date.now()}`, type: "run.stop", label: "Stop requested", detail: activeRunId, at: new Date().toISOString(), state: "info" });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to stop the active work"); }
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
      if (!response.ok) throw new Error(data.error || "Guidance request failed");
      appendActivity({ id: `steer-${Date.now()}`, type: "run.steer", label: "Guidance queued", detail: steerText.trim(), at: new Date().toISOString(), state: "info" });
      setSteerText("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to guide the active work"); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    sendToHermes(draft);
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void sendToHermes(draft);
    }
  }

  function queueResearchAction(prompt: string, options?: { mission?: boolean; openChat?: boolean }) {
    if (options?.openChat !== false) setView("chat");
    setPendingAction({ prompt, mission: options?.mission });
    if (environment !== "research") setEnvironment("research");
  }

  function openConversation(id: string) {
    setSelectedId(id);
    setSessionDrawerOpen(false);
    setCommandOpen(false);
    setView("chat");
  }

  function refreshAll() {
    void loadStatus();
    void loadSessions();
    void loadStats();
    if (selectedId) void loadMessages();
  }

  const primaryWorkTitle = streaming
    ? "Hermes is working on your latest instruction"
    : sessions.find((session) => session.active)?.title
      || sessions.find((session) => session.active)?.preview
      || selectedSession?.title
      || selectedSession?.preview
      || "No active work reported";

  const primaryWorkDetail = mission?.inProgress && mission.inProgress !== "Not supplied by Hermes in this snapshot."
    ? mission.inProgress
    : streaming
      ? "Live work is in progress. Open Chat to follow it."
      : "Open a conversation or refresh the current plan to see more context.";

  const pageTitle = view === "overview" ? "Overview" : view === "chat" ? "Chat" : view === "work" ? "Work" : "Library";

  const commands = [
    { label: "Ask Hermes", hint: "Open Chat", action: () => { setCommandOpen(false); setView("chat"); if (environment !== "research") setEnvironment("research"); } },
    { label: "Continue current plan", hint: "Ask Hermes to continue", action: () => { setCommandOpen(false); queueResearchAction(quickActions[0].prompt); } },
    { label: "Review latest backtest", hint: "Ask Hermes", action: () => { setCommandOpen(false); queueResearchAction(quickActions[2].prompt); } },
    { label: "Open current plan", hint: "Work", action: () => { setCommandOpen(false); setView("work"); } },
    { label: "View recent activity", hint: "Work", action: () => { setCommandOpen(false); setView("work"); } },
    { label: "Browse library", hint: "Outputs & capabilities", action: () => { setCommandOpen(false); setView("library"); } },
    { label: "New conversation", hint: "Research", action: () => { setCommandOpen(false); void newSession(); } },
  ].filter((item) => item.label.toLowerCase().includes(commandQuery.trim().toLowerCase()));

  function renderOverview() {
    return <div className={styles.viewStack}>
      <section className={styles.hero}>
        <div className={styles.heroTopline}>
          <span className={`${styles.workBadge} ${styles[`work_${currentWork.tone}`] || ""}`}><i />{currentWork.label}</span>
          <span className={styles.heroEnvironment}>{environment === "research" ? "Research workspace" : "Production · protected"}</span>
        </div>
        <p className={styles.kicker}>Current work</p>
        <h2>{primaryWorkTitle}</h2>
        <p className={styles.heroCopy}>{primaryWorkDetail}</p>
        <div className={styles.heroActions}>
          <button className={styles.primaryButton} onClick={() => queueResearchAction(quickActions[0].prompt)}>Continue with Hermes</button>
          <button className={styles.secondaryButton} onClick={() => setView("chat")}>Ask Hermes</button>
          <button className={styles.ghostButton} onClick={() => setView("work")}>View current plan</button>
        </div>
        {selectedSession && <div className={styles.continuity}>
          <span>Continue where you left off</span>
          <button onClick={() => openConversation(sessionId(selectedSession))}>
            <strong>{selectedSession.title || selectedSession.preview || "Recent conversation"}</strong>
            <small>Last activity {formatTime(selectedSession.updated_at || selectedSession.started_at || selectedSession.created_at)}</small>
          </button>
        </div>}
      </section>

      <div className={styles.overviewGrid}>
        <section className={`${styles.softPanel} ${needsYou.kind === "needs" ? styles.needsAttention : ""}`}>
          <SectionHeading eyebrow="Needs you" title={needsYou.title} />
          <p>{needsYou.body}</p>
          {needsYou.kind === "unknown" && <button className={styles.textButton} onClick={() => queueResearchAction(MISSION_PROMPT, { mission: true, openChat: false })}>Refresh plan</button>}
          {needsYou.kind === "needs" && <button className={styles.textButton} onClick={() => setView("work")}>Open request</button>}
        </section>

        <section className={styles.softPanel}>
          <SectionHeading eyebrow="Next" title={mission?.next && mission.next !== "Not supplied by Hermes in this snapshot." ? mission.next : "No next step reported yet"} />
          <p>{mission ? "From Hermes' latest current-plan snapshot." : "Refresh the current plan to let Hermes report the next step from its persisted state."}</p>
          {!mission && <button className={styles.textButton} onClick={() => queueResearchAction(MISSION_PROMPT, { mission: true, openChat: false })}>Refresh plan</button>}
        </section>
      </div>

      <section className={styles.contentSection}>
        <SectionHeading eyebrow="Recent activity" title="What happened recently" action={<button className={styles.textButton} onClick={() => setView("work")}>View all</button>} />
        {activityGroups.length === 0 ? <div className={styles.emptyInline}><strong>No activity loaded</strong><span>Open a conversation to load historical tool activity, or work with Hermes in Research.</span></div> :
          <div className={styles.recentActivity}>{activityGroups.slice(0, 4).map((group) => <button key={group.id} onClick={() => setView("work")}>
            <i className={styles[`activityDot_${group.state}`]} />
            <div><strong>{group.title}</strong><span>{group.items[0]?.label}{group.items.length > 1 ? ` · ${group.items.length} actions` : ""}</span></div>
            <time>{formatTime(group.start)}</time>
          </button>)}</div>}
      </section>

      <section className={styles.contentSection}>
        <SectionHeading eyebrow="Recent work" title="Conversations" action={<button className={styles.textButton} onClick={() => setSessionDrawerOpen(true)}>Browse all</button>} />
        {sessionState === "loading" ? <div className={styles.emptyInline}><span>Loading recent work…</span></div> :
          sessionState === "offline" ? <div className={styles.emptyInline}><strong>Recent work couldn't be loaded</strong><span>{sessionError}</span></div> :
            sessions.length === 0 ? <div className={styles.emptyInline}><strong>No conversations yet</strong><span>{interactive ? "Start a conversation with Hermes." : "No persisted production conversations were returned."}</span></div> :
              <div className={styles.workList}>{sessions.slice(0, 4).map((session) => {
                const id = sessionId(session);
                return <button key={id} onClick={() => openConversation(id)}>
                  <div><strong>{session.title || session.preview || "Untitled conversation"}</strong><span>{session.preview || (session.active ? "Active work" : "Hermes conversation")}</span></div>
                  <div><span className={session.active ? styles.activeText : ""}>{session.active ? "Active" : "Open"}</span><time>{formatTime(session.updated_at || session.started_at || session.created_at)}</time></div>
                </button>;
              })}</div>}
      </section>
    </div>;
  }

  function renderMessage(message: HermesMessage, index: number) {
    const role = String(message.role || "unknown").toLowerCase();
    const text = messageText(message);
    const toolLike = role === "tool" || Boolean(message.tool_name);
    if (toolLike) {
      const tool = String(message.tool_name || message.name || "Hermes tool");
      return <details key={String(message.id ?? index)} className={styles.toolMessage}>
        <summary><span>Hermes used {humanizeName(tool)}</span><time>{formatTime(message.created_at || message.timestamp)}</time></summary>
        <p>{shortText(text, 500) || "Tool activity was recorded."}</p>
        <details className={styles.technicalDetails}><summary>Technical details</summary><pre>{text || JSON.stringify(message, null, 2)}</pre></details>
      </details>;
    }
    return <article key={String(message.id ?? index)} className={`${styles.chatMessage} ${styles[`message_${role}`] || ""}`}>
      <div className={styles.messageAvatar}>{role === "assistant" ? "H" : role === "user" ? "Y" : "•"}</div>
      <div className={styles.messageBody}>
        <header><strong>{role === "assistant" ? "Hermes" : role === "user" ? "You" : humanizeName(role)}</strong><time>{formatTime(message.created_at || message.timestamp)}</time></header>
        <div className={styles.messageText}>{text || (Array.isArray(message.tool_calls) ? "Hermes recorded tool activity." : "No textual content")}</div>
        {Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && <details className={styles.toolSummary}><summary>Hermes used {message.tool_calls.length} tool{message.tool_calls.length === 1 ? "" : "s"}</summary>
          <div>{message.tool_calls.map((call, callIndex) => {
            const record = asRecord(call);
            const fn = asRecord(record?.function);
            const name = String(record?.name || fn?.name || "Tool");
            return <div key={callIndex}><strong>{humanizeName(name)}</strong><span>{shortText(record?.arguments ?? fn?.arguments, 180) || "Tool call"}</span></div>;
          })}</div>
          <details className={styles.technicalDetails}><summary>Raw tool data</summary><pre>{JSON.stringify(message.tool_calls, null, 2)}</pre></details>
        </details>}
      </div>
    </article>;
  }

  function renderChat() {
    return <section className={styles.chatWorkspace}>
      <div className={styles.chatToolbar}>
        <button className={styles.secondaryButton} onClick={() => setSessionDrawerOpen(true)}>Conversations</button>
        <div className={styles.chatIdentity}>
          <strong>{selectedSession?.title || selectedSession?.preview || (interactive ? "New conversation" : "Select a conversation")}</strong>
          <span>{selectedSession ? `Last activity ${formatTime(selectedSession.updated_at || selectedSession.started_at || selectedSession.created_at)}` : interactive ? "Research workspace" : "Production history"}</span>
        </div>
        <details className={styles.moreMenu}>
          <summary aria-label="Conversation actions">•••</summary>
          <div>
            <button disabled={!selectedId} onClick={exportSession}>Export conversation</button>
            {interactive && <button disabled={!selectedId} onClick={() => { setRenameValue(String(selectedSession?.title || "")); setRenameOpen(true); }}>Rename</button>}
            {interactive && <button disabled={!selectedId} onClick={forkSession}>Branch conversation</button>}
          </div>
        </details>
      </div>

      {!interactive && <div className={styles.productionBanner}>
        <div><strong>Production is protected</strong><span>You can inspect Hermes' approved work here. Changes cannot be made from Hermes Control.</span></div>
        <button onClick={() => setEnvironment("research")}>Continue in Research</button>
      </div>}

      <div className={styles.thread}>
        {!selectedId && !messagesBusy && <div className={styles.chatEmpty}>
          <div className={styles.hermesMark}>H</div>
          <h2>{interactive ? "What should Hermes work on?" : "Choose previous work to inspect"}</h2>
          <p>{interactive ? "Start a new conversation or open previous work. Hermes keeps the persisted context underneath." : "Open Conversations to inspect existing production sessions without changing them."}</p>
          {interactive && <button className={styles.primaryButton} onClick={newSession}>New conversation</button>}
        </div>}
        {selectedId && messagesBusy && messages.length === 0 && <div className={styles.localLoading}>Loading conversation…</div>}
        {messages.map(renderMessage)}
        {streaming && <article className={`${styles.chatMessage} ${styles.message_assistant} ${styles.streamingMessage}`}>
          <div className={styles.messageAvatar}>H</div>
          <div className={styles.messageBody}>
            <header><strong>Hermes</strong><span className={styles.streamingLabel}><i />Working</span></header>
            <div className={styles.messageText}>{streamText || "Hermes is using its tools…"}</div>
            {combinedActivity[0] && <details className={styles.liveActivity}><summary>View live activity</summary><span>{combinedActivity[0].label}</span>{combinedActivity[0].detail && <p>{combinedActivity[0].detail}</p>}</details>}
          </div>
        </article>}
        <div ref={threadEndRef} />
      </div>

      {interactive ? <div className={styles.composerDock}>
        {streaming && <div className={styles.activeWorkBar}>
          <div><i /><span><strong>Hermes is working</strong>{combinedActivity[0]?.label || "Processing your instruction"}</span></div>
          {activeRunId && <details><summary>Guide this run</summary><div><input value={steerText} onChange={(event) => setSteerText(event.target.value)} placeholder="Add guidance at the next tool boundary…" /><button disabled={!steerText.trim()} onClick={steerRun}>Send guidance</button></div></details>}
        </div>}
        <form className={styles.composer} onSubmit={submit}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={composerKeyDown} rows={3} placeholder="Ask Hermes anything about its current work…" aria-label="Message Hermes" />
          <div className={styles.composerBottom}>
            <div className={styles.suggestionRow}>{quickActions.slice(0, 4).map((action) => <button type="button" key={action.label} disabled={streaming} onClick={() => sendToHermes(action.prompt)}>{action.shortLabel}</button>)}</div>
            {streaming ? <button type="button" className={styles.stopComposer} disabled={!activeRunId} onClick={stopRun}>{activeRunId ? "Stop" : "Working…"}</button> :
              <button className={styles.sendButton} disabled={!draft.trim()}>Send <span>⌘↵</span></button>}
          </div>
        </form>
      </div> : <div className={styles.readOnlyComposer}><span>Production is read-only from Hermes Control.</span><button className={styles.primaryButton} onClick={() => setEnvironment("research")}>Work with Hermes in Research</button></div>}
    </section>;
  }

  function renderWork() {
    return <div className={styles.workView}>
      <div className={styles.workMain}>
        <section className={styles.planPanel}>
          <SectionHeading eyebrow="Current plan" title="What Hermes is trying to achieve" action={interactive ? <button className={styles.refreshPlan} disabled={streaming || missionPending} onClick={() => queueResearchAction(MISSION_PROMPT, { mission: true, openChat: false })}>{missionPending ? "Refreshing…" : "Refresh plan"}</button> : undefined} />
          {!interactive && <div className={styles.inlineCallout}><strong>Production is read-only</strong><span>Hermes' generated plan snapshot is refreshed from Research. Production conversation history remains available in Chat.</span><button onClick={() => setEnvironment("research")}>Switch to Research</button></div>}
          {interactive && !mission && <div className={styles.planEmpty}><strong>No current plan snapshot available</strong><p>Hermes has not supplied a plan snapshot for this conversation yet. Refreshing asks Hermes to inspect its persisted sessions, memory, files and recent work.</p><button className={styles.primaryButton} onClick={() => queueResearchAction(MISSION_PROMPT, { mission: true, openChat: false })}>Ask Hermes for current plan</button></div>}
          {mission && <div className={styles.planContent}>
            <div className={styles.objectiveBlock}><span>Current objective</span><h3>{mission.objective}</h3><small>Updated {formatTime(mission.at)}</small></div>
            <div className={styles.planColumns}>
              <div><span>In progress</span><p>{mission.inProgress}</p></div>
              <div><span>Next</span><p>{mission.next}</p></div>
            </div>
            <div className={`${styles.needsBlock} ${needsYou.kind === "needs" ? styles.needsBlockAttention : ""}`}><span>Needs you</span><strong>{needsYou.title}</strong><p>{needsYou.body}</p></div>
            <details className={styles.planDetails}><summary>Completed work and important context</summary><div><span>Completed</span><p>{mission.completed}</p></div><div><span>Important context</span><p>{mission.context}</p></div></details>
            <details className={styles.technicalDetails}><summary>Raw Hermes snapshot</summary><pre>{mission.raw}</pre></details>
          </div>}
        </section>

        <section className={styles.contentSection}>
          <SectionHeading eyebrow="Activity" title="What Hermes has been doing" />
          {activityGroups.length === 0 ? <div className={styles.emptyInline}><strong>No activity loaded</strong><span>Activity appears from the selected conversation and live Hermes work.</span></div> :
            <div className={styles.timeline}>{activityGroups.slice(0, 20).map((group) => <article key={group.id}>
              <div className={`${styles.timelineDot} ${styles[`activityDot_${group.state}`]}`} />
              <div className={styles.timelineBody}>
                <header><strong>{group.title}</strong><time>{formatTime(group.start)}</time></header>
                <p>{group.items[0]?.label}{group.items.length > 1 ? ` · ${group.items.length} related actions` : ""}</p>
                <details><summary>View activity</summary><div className={styles.activityDetails}>{group.items.map((item) => <div key={item.id}><strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}<small>{formatTime(item.at)}</small><details className={styles.technicalDetails}><summary>Technical event</summary><pre>{item.type}</pre></details></div>)}</div></details>
              </div>
            </article>)}</div>}
        </section>
      </div>

      <aside className={styles.workContext}>
        <section>
          <span>Work status</span>
          <strong>{currentWork.label}</strong>
          <p>{currentWork.label === "Working" ? primaryWorkTitle : "Hermes is not reporting an active task right now."}</p>
        </section>
        <section>
          <span>Environment</span>
          <strong>{environment === "research" ? "Research" : "Production"}</strong>
          <p>{interactive ? "Development workspace. Hermes may research and use its tools here." : "Approved investment brain. Inspect-only from this interface."}</p>
        </section>
        <section>
          <span>Conversation</span>
          <strong>{selectedSession?.title || selectedSession?.preview || "None selected"}</strong>
          {selectedSession && <button className={styles.textButton} onClick={() => setView("chat")}>Open conversation</button>}
        </section>
      </aside>
    </div>;
  }

  function renderLibrary() {
    return <div className={styles.libraryView}>
      <section className={styles.libraryHero}>
        <div><span className={styles.kicker}>Knowledge & output</span><h2>Library</h2><p>Research notes, backtests, datasets and other output detected in the selected Hermes conversation. Raw paths stay available in details.</p></div>
        <button className={styles.secondaryButton} onClick={() => { setCommandQuery(""); setCommandOpen(true); }}>Search Hermes</button>
      </section>

      <section className={styles.contentSection}>
        <SectionHeading eyebrow="Recent output" title="Artifacts" />
        {artifacts.length === 0 ? <div className={styles.libraryEmpty}><strong>No outputs detected in this conversation</strong><p>Hermes Control only shows artifact paths that actually appear in Hermes messages or tool activity. It does not fabricate a workspace inventory.</p><button className={styles.textButton} onClick={() => setView("chat")}>Open conversation</button></div> :
          <div className={styles.artifactGrid}>{artifacts.map((artifact) => <button key={artifact.path} onClick={() => setSelectedArtifact(artifact)}>
            <div className={styles.fileIcon}>{artifact.kind.slice(0, 3).toUpperCase()}</div>
            <div><strong>{artifactName(artifact.path)}</strong><span>{artifactType(artifact.kind)}</span><small>{artifact.source === "live" ? "Detected in live Hermes activity" : "Detected in current conversation"}</small></div>
          </button>)}</div>}
      </section>

      <section className={styles.contentSection}>
        <SectionHeading eyebrow="Hermes brain" title="Capabilities" action={<Link className={styles.textLink} href="/brain/lab">Open Brain Lab</Link>} />
        <div className={styles.capabilitySummary}>
          <div><strong>{status?.skills.state === "connected" ? skills.length : "—"}</strong><span>Skills</span></div>
          <div><strong>{status?.toolsets.state === "connected" ? toolsets.length : "—"}</strong><span>Toolsets</span></div>
          <p>Advanced brain information is deliberately secondary. Brain Lab is where you inspect and improve Hermes itself.</p>
        </div>
        {capabilities.length > 0 && <details className={styles.capabilityDetails}><summary>Browse reported capabilities</summary><div>{capabilities.slice(0, 20).map((item) => <article key={item.id}>
          <div><span>{item.type === "skill" ? "Skill" : "Toolset"}</span><strong>{humanizeName(item.name)}</strong></div>
          <p>{item.description || "No description supplied by Hermes."}</p>
          <details className={styles.technicalDetails}><summary>Technical details</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>
        </article>)}</div></details>}
      </section>
    </div>;
  }

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span>H</span><div><strong>HERMES</strong><small>INVESTMENT OS</small></div></Link>
      <nav aria-label="Hermes Control">
        <button className={view === "overview" ? styles.navActive : ""} onClick={() => setView("overview")}><span>Overview</span><small>Now</small></button>
        <button className={view === "chat" ? styles.navActive : ""} onClick={() => setView("chat")}><span>Chat</span><small>Work with Hermes</small></button>
        <button className={view === "work" ? styles.navActive : ""} onClick={() => setView("work")}><span>Work</span><small>Plan & activity</small></button>
        <button className={view === "library" ? styles.navActive : ""} onClick={() => setView("library")}><span>Library</span><small>Research & output</small></button>
      </nav>
      <div className={styles.sidebarDivider} />
      <Link href="/brain/lab" className={styles.labLink}><span>Brain Lab</span><small>Improve Hermes</small></Link>
      <div className={styles.sidebarStatus}>
        <ConnectionBadge state={environmentState} />
        <div><strong>{environment === "research" ? "Research" : "Production"}</strong><span>{environment === "research" ? "Interactive workspace" : "Protected · read-only"}</span></div>
      </div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}>
        <div className={styles.pageIdentity}><span>Hermes Control</span><h1>{pageTitle}</h1></div>
        <div className={styles.topbarActions}>
          <button className={styles.searchTrigger} onClick={() => setCommandOpen(true)}><span>Search Hermes…</span><kbd>⌘K</kbd></button>
          <EnvironmentSwitch environment={environment} onChange={setEnvironment} />
          <ConnectionBadge state={environmentState} />
          <button className={styles.iconButton} aria-label="Refresh Hermes Control" title="Refresh" onClick={refreshAll}>↻</button>
          <button className={styles.iconButton} aria-label="Open technical details" title="Technical details" onClick={() => setDetailsOpen(true)}>⋯</button>
        </div>
      </header>

      {notice && <div className={styles.notice} role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div>}

      <div className={styles.pageBody}>
        {sessionState === "offline" && <div className={styles.offlineBanner}>
          <div><strong>{environment === "research" ? "Research workspace isn't connected" : "Hermes conversations couldn't be loaded"}</strong><span>The OS remains available, but live Hermes actions for this environment are unavailable right now.</span></div>
          <button onClick={refreshAll}>Retry connection</button>
        </div>}
        {view === "overview" && renderOverview()}
        {view === "chat" && renderChat()}
        {view === "work" && renderWork()}
        {view === "library" && renderLibrary()}
      </div>
    </main>

    <nav className={styles.mobileNav} aria-label="Hermes Control mobile navigation">
      <button className={view === "overview" ? styles.mobileNavActive : ""} onClick={() => setView("overview")}>Overview</button>
      <button className={view === "chat" ? styles.mobileNavActive : ""} onClick={() => setView("chat")}>Chat</button>
      <button className={view === "work" ? styles.mobileNavActive : ""} onClick={() => setView("work")}>Work</button>
      <button className={view === "library" ? styles.mobileNavActive : ""} onClick={() => setView("library")}>Library</button>
    </nav>

    {sessionDrawerOpen && <div className={styles.drawerBackdrop} onMouseDown={() => setSessionDrawerOpen(false)}>
      <aside className={styles.sessionDrawer} role="dialog" aria-modal="true" aria-label="Conversations" onKeyDown={focusTrap} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>History</span><h2>Conversations</h2></div><button aria-label="Close conversations" onClick={() => setSessionDrawerOpen(false)}>×</button></header>
        {interactive && <button className={styles.newConversation} onClick={newSession}>＋ New conversation</button>}
        <form className={styles.drawerSearch} onSubmit={(event) => { event.preventDefault(); void loadSessions(environment, search); }}><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations…" aria-label="Search conversations" /><button>Search</button></form>
        {search && <button className={styles.clearSearch} onClick={() => { setSearch(""); void loadSessions(environment, ""); }}>Clear search</button>}
        <div className={styles.drawerSessions}>
          {sessionState === "loading" && <div className={styles.drawerEmpty}>Loading conversations…</div>}
          {sessionState === "offline" && <div className={styles.drawerEmpty}><strong>Conversations couldn't be loaded</strong><span>{sessionError}</span></div>}
          {sessionState === "ready" && sessions.length === 0 && <div className={styles.drawerEmpty}><strong>No conversations found</strong><span>{search ? "Try another search." : "Hermes did not return persisted conversations for this environment."}</span></div>}
          {sessions.map((session) => {
            const id = sessionId(session);
            return <button key={id} className={selectedId === id ? styles.drawerSessionActive : ""} onClick={() => openConversation(id)}>
              <div><strong>{session.title || session.preview || "Untitled conversation"}</strong>{session.active && <span>Active</span>}</div>
              <p>{session.preview || "Hermes conversation"}</p>
              <time>{formatTime(session.updated_at || session.started_at || session.created_at)}</time>
            </button>;
          })}
        </div>
      </aside>
    </div>}

    {detailsOpen && <div className={styles.drawerBackdrop} onMouseDown={() => setDetailsOpen(false)}>
      <aside className={styles.detailsDrawer} role="dialog" aria-modal="true" aria-label="Technical details" onKeyDown={focusTrap} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Advanced</span><h2>Technical details</h2></div><button aria-label="Close technical details" onClick={() => setDetailsOpen(false)}>×</button></header>
        <section><span>Environment</span><strong>{environment === "research" ? "Research" : "Production"}</strong><code>{environment === "research" ? "his-research" : "his-production"}</code></section>
        <section><span>Infrastructure</span><ConnectionBadge state={environmentState} /><code>{environmentState || "unknown"}</code></section>
        <section><span>Selected conversation</span><strong>{selectedSession?.title || selectedSession?.preview || "None"}</strong><code>{selectedId || "No session ID"}</code></section>
        <section><span>Model</span><strong>{selectedSession?.model || status?.production.model || "Not reported"}</strong></section>
        <section><span>Active run</span><strong>{activeRunId ? "Running" : "None"}</strong><code>{activeRunId || "No active run ID"}</code></section>
        <section><span>Hermes inventory</span><strong>{status?.skills.state === "connected" ? `${skills.length} skills` : "Skills unavailable"}</strong><strong>{status?.toolsets.state === "connected" ? `${toolsets.length} toolsets` : "Toolsets unavailable"}</strong></section>
        {lastTechnicalError && <section><span>Last technical error</span><code>{lastTechnicalError}</code></section>}
        <section><span>Broker execution</span><strong className={styles.protectedText}>Locked outside Brain Studio</strong></section>
        <section><span>Persisted conversations</span><strong>{statTotal || sessions.length || "—"}</strong></section>
      </aside>
    </div>}

    {commandOpen && <div className={styles.commandBackdrop} onMouseDown={() => setCommandOpen(false)}>
      <div className={styles.commandPalette} role="dialog" aria-modal="true" aria-label="Search Hermes" onKeyDown={focusTrap} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.commandInput}><span>⌕</span><input ref={commandInputRef} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search Hermes or run a command…" aria-label="Search Hermes" /><kbd>Esc</kbd></div>
        <div className={styles.commandResults}>
          {commands.length > 0 && <section><span>Actions</span>{commands.map((command) => <button key={command.label} onClick={command.action}><strong>{command.label}</strong><small>{command.hint}</small></button>)}</section>}
          {filteredSessionsForCommand.length > 0 && <section><span>Conversations</span>{filteredSessionsForCommand.map((session) => {
            const id = sessionId(session);
            return <button key={id} onClick={() => openConversation(id)}><strong>{session.title || session.preview || "Untitled conversation"}</strong><small>{formatTime(session.updated_at || session.started_at || session.created_at)}</small></button>;
          })}</section>}
          {filteredArtifacts.slice(0, 6).length > 0 && <section><span>Outputs</span>{filteredArtifacts.slice(0, 6).map((artifact) => <button key={artifact.path} onClick={() => { setCommandOpen(false); setView("library"); setSelectedArtifact(artifact); }}><strong>{artifactName(artifact.path)}</strong><small>{artifactType(artifact.kind)}</small></button>)}</section>}
          {commandQuery && commands.length === 0 && filteredSessionsForCommand.length === 0 && filteredArtifacts.length === 0 && <div className={styles.commandEmpty}>Nothing loaded matches “{commandQuery}”.</div>}
        </div>
        <footer><span>Search uses currently loaded Hermes sessions and outputs.</span><Link href="/brain/lab">Open Brain Lab</Link></footer>
      </div>
    </div>}

    {selectedArtifact && <div className={styles.drawerBackdrop} onMouseDown={() => setSelectedArtifact(null)}>
      <aside className={styles.detailsDrawer} role="dialog" aria-modal="true" aria-label="Artifact details" onKeyDown={focusTrap} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>{artifactType(selectedArtifact.kind)}</span><h2>{artifactName(selectedArtifact.path)}</h2></div><button aria-label="Close artifact" onClick={() => setSelectedArtifact(null)}>×</button></header>
        <section><span>Detected from</span><strong>{selectedArtifact.source === "live" ? "Live Hermes activity" : "Current conversation"}</strong></section>
        <section><span>Related conversation</span><strong>{selectedSession?.title || selectedSession?.preview || "Not available"}</strong>{selectedSession && <button className={styles.textButton} onClick={() => { setSelectedArtifact(null); setView("chat"); }}>Open conversation</button>}</section>
        <section><span>File type</span><strong>{artifactType(selectedArtifact.kind)}</strong><code>.{selectedArtifact.kind}</code></section>
        <section><span>Raw path</span><code className={styles.pathCode}>{selectedArtifact.path}</code></section>
        <div className={styles.drawerNote}>Hermes Control detected this path in Hermes output. A direct file viewer is only shown when a real retrieval endpoint exists.</div>
      </aside>
    </div>}

    {renameOpen && <div className={styles.commandBackdrop} onMouseDown={() => setRenameOpen(false)}>
      <div className={styles.renameDialog} role="dialog" aria-modal="true" aria-label="Rename conversation" onKeyDown={focusTrap} onMouseDown={(event) => event.stopPropagation()}>
        <span>Conversation</span><h2>Rename</h2><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void renameSession(); }} aria-label="Conversation title" />
        <div><button className={styles.secondaryButton} onClick={() => setRenameOpen(false)}>Cancel</button><button className={styles.primaryButton} disabled={!renameValue.trim()} onClick={renameSession}>Save</button></div>
      </div>
    </div>}
  </div>;
}
