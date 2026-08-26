"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { BrainStatus, CapabilityItem } from "@/lib/brain/types";
import styles from "./hermes-control-v033.module.css";

type Environment = "research" | "production";
type View = "overview" | "chat" | "work" | "library";
type Session = {
  id?: string; session_id?: string; sessionId?: string; title?: string | null; preview?: string; source?: string; model?: string;
  started_at?: string; updated_at?: string; created_at?: string; active?: boolean; [key: string]: unknown;
};
type Message = {
  id?: string | number; role?: string; content?: unknown; text?: unknown; output?: unknown; created_at?: string; timestamp?: string;
  tool_name?: string; name?: string; tool_calls?: unknown[]; [key: string]: unknown;
};
type Activity = { id: string; label: string; detail?: string; at: string; state: "live" | "done" | "info" | "error"; type: string };
type Artifact = { path: string; kind: string; source: "session" | "live" };
type Mission = { objective: string; completed: string; inProgress: string; next: string; blockers: string; context: string; raw: string; at: string; sessionId: string };
type Status = BrainStatus & { productionPolicy?: { promotionEnabled: boolean; builderMutationEnabled: boolean; explanation: string } };
type Pending = { prompt: string; mission?: boolean };

const MISSION_PROMPT = `Maak een actuele snapshot van je EIGEN bestaande investment-system plan. Inspecteer daarvoor je persisted sessions, memory, relevante project files, recente research/backtests en openstaande taken. Baseer je antwoord op wat werkelijk bestaat; verzin niets en ontwerp geen nieuwe roadmap als er al een plan bestaat.

Gebruik exact deze headings en vul ze concreet in:
CURRENT OBJECTIVE:
COMPLETED:
IN PROGRESS:
NEXT:
BLOCKERS:
IMPORTANT CONTEXT:

Als informatie ontbreekt, zet dat onder de relevante heading. Verander geen broker execution-instellingen of harde risk limits.`;

const prompts = [
  { label: "Continue current plan", short: "Continue plan", prompt: "Ga verder met het hoogste-prioriteit unfinished item uit je bestaande investment-system plan. Inspecteer eerst je relevante persisted sessions, memory, project files en recente outputs. Vertel kort wat je hervat en waarom, en ga daarna daadwerkelijk verder. Verander geen broker execution-instellingen of harde risk limits zonder expliciete menselijke approval." },
  { label: "What are you working on?", short: "Current work", prompt: "Vertel kort waar je momenteel daadwerkelijk aan werkt binnen je bestaande investment-system plan, wat het concrete doel is en wat je eerstvolgende stap is. Baseer dit op persisted state; verzin niets." },
  { label: "Review latest backtest", short: "Latest backtest", prompt: "Zoek je meest recente relevante backtest of backtestanalyse in je eigen workspace/sessions. Review de resultaten, methodologie, sample size, mogelijke leakage/overfitting en de openstaande vervolgstap volgens je bestaande plan. Als je geen betrouwbare backtest kunt vinden, zeg dat expliciet." },
  { label: "What do you need from me?", short: "Needs me", prompt: "Inspecteer je huidige investment-system plan en werkstatus. Geef alleen de echte blockers of beslissingen waarvoor je input, toegang of approval van mij nodig hebt. Benoem ook expliciet als je niets van mij nodig hebt. Gebruik bestaande state en bewijs; verzin niets." },
];

const artifactPattern = /(?:~\/|\/)[^\s\n\r\t"'`<>]+?\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|odt|rtf|txt|md|epub|xlsx?|ods|csv|tsv|json|xml|ya?ml|pptx?|odp|key|zip|tar|gz|tgz|html?)(?=$|[\s\n\r\t"'`<>),.;:])/gi;
const fileNames: Record<string, string> = { md: "Research note", txt: "Text note", pdf: "PDF report", csv: "Dataset", tsv: "Dataset", xls: "Spreadsheet", xlsx: "Spreadsheet", ods: "Spreadsheet", json: "Structured data", yaml: "Configuration", yml: "Configuration", doc: "Document", docx: "Document", ppt: "Presentation", pptx: "Presentation", png: "Image", jpg: "Image", jpeg: "Image", webp: "Image", svg: "Image", html: "Web document", zip: "Archive" };

function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function unwrap(value: unknown) { const record = asRecord(value); return record && "payload" in record ? record.payload : value; }
function sid(session?: Session | null) { return session ? String(session.id || session.session_id || session.sessionId || "") : ""; }
function extractSessions(value: unknown): Session[] { const p = unwrap(value); if (Array.isArray(p)) return p as Session[]; const r = asRecord(p); if (!r) return []; for (const k of ["sessions", "items", "results", "data"]) if (Array.isArray(r[k])) return r[k] as Session[]; return []; }
function extractSession(value: unknown): Session | null { const p = unwrap(value); const r = asRecord(p); if (!r) return null; return (asRecord(r.session) || r) as Session; }
function extractMessages(value: unknown): Message[] { const p = unwrap(value); if (Array.isArray(p)) return p as Message[]; const r = asRecord(p); if (!r) return []; for (const k of ["messages", "items", "data"]) if (Array.isArray(r[k])) return r[k] as Message[]; return []; }
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : text(asRecord(part)?.text ?? asRecord(part)?.content ?? asRecord(part)?.output ?? "")).filter(Boolean).join("\n");
  const r = asRecord(value); if (!r) return "";
  for (const k of ["text", "content", "output", "message", "result", "summary", "delta"]) if (r[k] !== undefined) { const v = text(r[k]); if (v) return v; }
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}
function messageText(message: Message) { return text(message.content ?? message.text ?? message.output ?? ""); }
function fmt(value?: string) { if (!value) return "—"; const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d); }
function short(value: unknown, max = 220) { const v = text(value).replace(/\s+/g, " ").trim(); return v.length > max ? `${v.slice(0, max - 1)}…` : v; }
function human(value: string) { return value.replace(/^tool[._-]?/i, "").replace(/[._-]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()).trim(); }
function friendly(error: unknown, fallback: string) { const raw = error instanceof Error ? error.message : String(error || ""); const l = raw.toLowerCase(); if (l.includes("not configured") || l.includes("not connected")) return "This Hermes workspace isn't connected yet."; if (l.includes("401") || l.includes("403") || l.includes("auth")) return "Hermes couldn't authenticate this workspace."; if (l.includes("502") || l.includes("503") || l.includes("gateway") || l.includes("offline") || l.includes("unavailable")) return "Hermes is temporarily unavailable."; return fallback; }
function artifactsFrom(value: string, source: Artifact["source"]): Artifact[] { return (value.match(artifactPattern) || []).map((p) => { const path = p.replace(/[),.;:]+$/, ""); return { path, kind: path.split(".").pop()?.toLowerCase() || "file", source }; }); }
function artifactName(path: string) { return path.split("/").filter(Boolean).pop() || path; }
function artifactType(kind: string) { return fileNames[kind] || `${kind.toUpperCase()} file`; }
function parseMission(raw: string, sessionId: string): Mission { const heads = ["CURRENT OBJECTIVE", "COMPLETED", "IN PROGRESS", "NEXT", "BLOCKERS", "IMPORTANT CONTEXT"] as const; const v: Record<string, string> = {}; heads.forEach((h, i) => { const next = heads[i + 1]; v[h] = raw.match(new RegExp(`${h}:\\s*([\\s\\S]*?)${next ? `(?=${next}:)` : "$"}`, "i"))?.[1]?.trim() || "Not supplied by Hermes in this snapshot."; }); return { objective: v["CURRENT OBJECTIVE"], completed: v.COMPLETED, inProgress: v["IN PROGRESS"], next: v.NEXT, blockers: v.BLOCKERS, context: v["IMPORTANT CONTEXT"], raw, at: new Date().toISOString(), sessionId }; }
function noValue(value?: string) { return !value || value === "Not supplied by Hermes in this snapshot."; }
function cleanBlockers(mission: Mission | null) { if (!mission) return { state: "unknown", title: "Unknown", body: "Refresh the plan to let Hermes report whether it needs you." }; const raw = mission.blockers.trim(); if (!raw || /^(none|geen|n\/a|no blockers?|nothing needed|geen blockers?)[.!]?$/i.test(raw) || raw.toLowerCase().includes("no blockers")) return { state: "clear", title: "Nothing right now", body: "Hermes reported no current blockers." }; return { state: "needs", title: "Hermes needs your attention", body: raw }; }

function historicalActivity(messages: Message[]): Activity[] {
  const out: Activity[] = [];
  messages.forEach((m, i) => {
    const at = m.created_at || m.timestamp || new Date().toISOString();
    if (String(m.role || "").toLowerCase() === "tool" || m.tool_name || m.name) out.push({ id: `t-${m.id ?? i}`, label: `Used ${human(String(m.tool_name || m.name || "tool"))}`, detail: short(m.content ?? m.output), at, state: "done", type: "tool.history" });
    if (Array.isArray(m.tool_calls)) m.tool_calls.forEach((c, ci) => { const r = asRecord(c); const fn = asRecord(r?.function); out.push({ id: `c-${m.id ?? i}-${ci}`, label: `Used ${human(String(r?.name || fn?.name || "tool"))}`, detail: short(r?.arguments ?? fn?.arguments), at, state: "done", type: "tool.call" }); });
  });
  return out.slice(-80);
}

function activityFromEvent(type: string, payload: Record<string, unknown>): Activity | null {
  const l = type.toLowerCase(); if (l.includes("assistant.delta") || l.includes("token") || l === "message") return null;
  const tool = human(String(payload.tool_name || payload.name || asRecord(payload.tool)?.name || "tool")); const at = new Date().toISOString();
  if (l.includes("tool.start")) return { id: `${Date.now()}-${Math.random()}`, label: `Using ${tool}`, detail: short(payload.arguments ?? payload.input ?? payload.args), at, state: "live", type };
  if (l.includes("tool.complete")) return { id: `${Date.now()}-${Math.random()}`, label: `Finished ${tool}`, detail: short(payload.summary ?? payload.result ?? payload.output), at, state: "done", type };
  if (l.includes("subagent.start")) return { id: `${Date.now()}-${Math.random()}`, label: "Delegated part of the research", detail: short(payload.task ?? payload.summary), at, state: "live", type };
  if (l.includes("subagent.complete")) return { id: `${Date.now()}-${Math.random()}`, label: "Delegated research completed", detail: short(payload.summary), at, state: "done", type };
  if (l.includes("run.completed")) return { id: `${Date.now()}-${Math.random()}`, label: "Hermes finished a work step", detail: short(payload.output ?? payload.summary), at, state: "done", type };
  if (l.includes("run.failed") || l.includes("error")) return { id: `${Date.now()}-${Math.random()}`, label: "A Hermes step failed", detail: short(payload.error ?? payload.message), at, state: "error", type };
  if (l.includes("run.start") || l.includes("run.created")) return { id: `${Date.now()}-${Math.random()}`, label: "Hermes started working", detail: short(payload), at, state: "live", type };
  return { id: `${Date.now()}-${Math.random()}`, label: human(type), detail: short(payload), at, state: "info", type };
}

function Connection({ state }: { state?: string }) {
  const s = state || "loading";
  const label = s === "connected" ? "Connected" : s === "not_configured" ? "Not connected" : s === "auth_error" ? "Auth issue" : s === "offline" ? "Offline" : s === "degraded" ? "Degraded" : "Checking";
  return <span className={`${styles.connection} ${styles[`connection_${s}`] || ""}`}><i />{label}</span>;
}

export function HermesControlV033() {
  const [view, setView] = useState<View>("overview");
  const [environment, setEnvironment] = useState<Environment>("production");
  const [status, setStatus] = useState<Status | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionState, setSessionState] = useState<"loading" | "ready" | "offline">("loading");
  const [sessionError, setSessionError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesBusy, setMessagesBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activeRunId, setActiveRunId] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [missionPending, setMissionPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [technicalError, setTechnicalError] = useState("");
  const [conversationOpen, setConversationOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [steerText, setSteerText] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const commandRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => sessions.find((s) => sid(s) === selectedId) || null, [sessions, selectedId]);
  const interactive = environment === "research";
  const environmentState = environment === "research" ? status?.research.state : status?.production.state;
  const skills = capabilities.filter((c) => c.type === "skill");
  const toolsets = capabilities.filter((c) => c.type === "toolset");
  const allActivity = useMemo(() => [...historicalActivity(messages), ...activity].slice(-80).reverse(), [messages, activity]);
  const artifacts = useMemo(() => { const out: Artifact[] = []; messages.forEach((m) => out.push(...artifactsFrom(messageText(m), "session"))); activity.forEach((a) => out.push(...artifactsFrom(`${a.label} ${a.detail || ""}`, "live"))); const seen = new Set<string>(); return out.filter((a) => !seen.has(a.path) && Boolean(seen.add(a.path))).slice(-50).reverse(); }, [messages, activity]);
  const blockers = cleanBlockers(mission);
  const activeSession = sessions.find((s) => s.active);
  const isWorking = streaming || Boolean(activeSession);
  const currentTitle = streaming ? "Hermes is working on your latest instruction" : activeSession?.title || activeSession?.preview || selected?.title || selected?.preview || "No active work reported";
  const currentDetail = !noValue(mission?.inProgress) ? mission!.inProgress : streaming ? "Live work is in progress. Open Chat to follow it." : "Hermes has not reported a current work summary yet.";

  async function loadStatus() {
    try {
      const [s, c] = await Promise.all([fetch("/api/brain/status", { cache: "no-store" }), fetch("/api/brain/capabilities", { cache: "no-store" })]);
      const sd = await s.json(); const cd = await c.json(); setStatus(sd); setCapabilities(Array.isArray(cd.items) ? cd.items : []);
    } catch { setStatus(null); setCapabilities([]); }
  }

  async function loadSessions(env = environment, q = sessionSearch) {
    setSessionState("loading"); setSessionError("");
    try {
      const params = new URLSearchParams({ environment: env, limit: "60" }); if (q.trim()) params.set("q", q.trim());
      const r = await fetch(`/api/brain/sessions?${params}`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Conversations unavailable");
      const items = extractSessions(d); setSessions(items); setSessionState("ready"); if (!items.some((s) => sid(s) === selectedId)) setSelectedId(items[0] ? sid(items[0]) : "");
    } catch (e) { setTechnicalError(e instanceof Error ? e.message : String(e)); setSessions([]); setSelectedId(""); setSessionState("offline"); setSessionError(friendly(e, "Conversations couldn't be loaded.")); }
  }

  async function loadMessages(id = selectedId, env = environment) {
    if (!id) { setMessages([]); return; } setMessagesBusy(true);
    try { const r = await fetch(`/api/brain/sessions/${encodeURIComponent(id)}/messages?environment=${env}&limit=500&order=oldest`, { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Conversation history unavailable"); setMessages(extractMessages(d)); }
    catch (e) { setTechnicalError(e instanceof Error ? e.message : String(e)); setMessages([]); setNotice(friendly(e, "Conversation history couldn't be loaded.")); }
    finally { setMessagesBusy(false); }
  }

  useEffect(() => { void loadStatus(); }, []);
  useEffect(() => { setMessages([]); setActivity([]); setStreamText(""); setMission(null); setSessionSearch(""); void loadSessions(environment, ""); }, [environment]);
  useEffect(() => { if (!selectedId) { setMessages([]); setMission(null); return; } void loadMessages(selectedId, environment); try { const cached = localStorage.getItem(`hermes-mission:${environment}:${selectedId}`); setMission(cached ? JSON.parse(cached) as Mission : null); } catch { setMission(null); } }, [selectedId, environment]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: streaming ? "smooth" : "auto", block: "end" }); }, [messages, streamText, streaming]);
  useEffect(() => { const h = (e: globalThis.KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCommandOpen(true); } if (e.key === "Escape") { setCommandOpen(false); setConversationOpen(false); setTechnicalOpen(false); setRenameOpen(false); setSelectedArtifact(null); } }; addEventListener("keydown", h); return () => removeEventListener("keydown", h); }, []);
  useEffect(() => { if (commandOpen) setTimeout(() => commandRef.current?.focus(), 0); else setCommandQuery(""); }, [commandOpen]);
  useEffect(() => { if (!pending || environment !== "research" || sessionState === "loading") return; const p = pending; setPending(null); if (sessionState === "offline") { setDraft(p.prompt); setView("chat"); setNotice("Research isn't connected yet. Your instruction is ready in the composer."); return; } void send(p.prompt, { mission: p.mission }); }, [pending, environment, sessionState]);

  async function createSession() {
    const r = await fetch("/api/brain/sessions?environment=research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `Conversation ${new Date().toLocaleDateString("en-GB")}` }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || "Unable to create conversation"); const created = extractSession(d); await loadSessions("research", ""); const id = sid(created); if (id) setSelectedId(id); return id;
  }

  function parseBlock(block: string, onDelta: (v: string) => void, onComplete: (v: string) => void) {
    let event = ""; const data: string[] = []; block.split(/\r?\n/).forEach((line) => { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trimStart()); }); if (!data.length) return; const raw = data.join("\n"); if (raw === "[DONE]") return;
    let payload: Record<string, unknown> = {}; try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { payload = { text: raw }; }
    const type = event || String(payload.type || payload.event || "message"); const runId = payload.run_id || payload.runId || payload.id; if (typeof runId === "string" && runId.startsWith("run_")) setActiveRunId(runId);
    const l = type.toLowerCase(); if (l.includes("assistant.delta")) { const v = text(payload.delta ?? payload.text ?? payload.content); if (v) onDelta(v); } else if (l.includes("run.completed")) { const v = text(payload.output ?? payload.text ?? payload.content); if (v) onComplete(v); } else if (l === "message" && typeof payload.text === "string") onDelta(payload.text);
    const a = activityFromEvent(type, payload); if (a) setActivity((cur) => [...cur.slice(-79), a]);
  }

  async function send(input: string, options?: { mission?: boolean }) {
    const clean = input.trim(); if (!clean || streaming) return; if (!interactive) { setNotice("Production is protected. Continue in Research to work with Hermes."); return; }
    let id = selectedId; if (!id) { try { id = await createSession(); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to create conversation"); return; } } if (!id) return;
    setMessages((cur) => [...cur, { id: `local-${Date.now()}`, role: "user", content: clean, created_at: new Date().toISOString() }]); setDraft(""); setStreaming(true); setStreamText(""); setActiveRunId(""); if (options?.mission) setMissionPending(true);
    try {
      const r = await fetch(`/api/brain/sessions/${encodeURIComponent(id)}/chat/stream?environment=research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: clean }) }); if (!r.ok || !r.body) throw new Error(await r.text() || `Hermes returned HTTP ${r.status}`);
      const reader = r.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let assistant = ""; const delta = (v: string) => { assistant += v; setStreamText(assistant); }; const complete = (v: string) => { if (!assistant.trim()) { assistant = v; setStreamText(v); } };
      while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let b = buffer.search(/\r?\n\r?\n/); while (b >= 0) { const block = buffer.slice(0, b); const delim = buffer.slice(b).match(/^\r?\n\r?\n/); buffer = buffer.slice(b + (delim?.[0].length || 2)); parseBlock(block, delta, complete); b = buffer.search(/\r?\n\r?\n/); } }
      if (buffer.trim()) parseBlock(buffer, delta, complete); const final = assistant.trim(); if (final) setMessages((cur) => [...cur, { id: `stream-${Date.now()}`, role: "assistant", content: final, created_at: new Date().toISOString() }]); if (options?.mission && final) { const m = parseMission(final, id); setMission(m); try { localStorage.setItem(`hermes-mission:research:${id}`, JSON.stringify(m)); } catch {} }
    } catch (e) { setTechnicalError(e instanceof Error ? e.message : String(e)); setNotice(friendly(e, "Hermes couldn't complete that request.")); }
    finally { setStreaming(false); setStreamText(""); setMissionPending(false); setActiveRunId(""); await loadMessages(id, "research"); await loadSessions("research", ""); }
  }

  function queue(prompt: string, mission?: boolean) { setView("chat"); setPending({ prompt, mission }); if (environment !== "research") setEnvironment("research"); }
  async function newConversation() { if (environment !== "research") { setEnvironment("research"); setView("chat"); return; } try { await createSession(); setConversationOpen(false); setView("chat"); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to create conversation"); } }
  async function rename() { if (!selectedId || !interactive || !renameValue.trim()) return; try { const r = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}?environment=research`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: renameValue.trim() }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Unable to rename"); setRenameOpen(false); await loadSessions("research", ""); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to rename"); } }
  async function fork() { if (!selectedId || !interactive) return; try { const r = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}/fork?environment=research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `${selected?.title || "Research"} — branch` }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Unable to branch"); const f = extractSession(d); await loadSessions("research", ""); if (sid(f)) setSelectedId(sid(f)); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to branch"); } }
  async function exportConversation() { if (!selectedId) return; try { const r = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedId)}/export?environment=${environment}`, { cache: "no-store" }); if (!r.ok) throw new Error(`Export failed: HTTP ${r.status}`); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `hermes-${environment}-${selectedId}.json`; a.click(); URL.revokeObjectURL(url); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to export"); } }
  async function stop() { if (!activeRunId) return; try { const r = await fetch(`/api/brain/runs/${encodeURIComponent(activeRunId)}/stop?environment=research`, { method: "POST" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Stop failed"); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to stop"); } }
  async function steer() { if (!activeRunId || !steerText.trim()) return; try { const r = await fetch(`/api/brain/runs/${encodeURIComponent(activeRunId)}/steer?environment=research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: steerText.trim() }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Guidance failed"); setSteerText(""); } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to guide run"); } }
  function openSession(id: string) { setSelectedId(id); setConversationOpen(false); setCommandOpen(false); setView("chat"); }
  function composerKey(e: KeyboardEvent<HTMLTextAreaElement>) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void send(draft); } }
  function submit(e: FormEvent) { e.preventDefault(); void send(draft); }

  const commandItems = [
    { label: "Ask Hermes", hint: "Open Chat", action: () => { setCommandOpen(false); setView("chat"); if (!interactive) setEnvironment("research"); } },
    { label: "Continue current plan", hint: "Work with Hermes", action: () => { setCommandOpen(false); queue(prompts[0].prompt); } },
    { label: "Review latest backtest", hint: "Work with Hermes", action: () => { setCommandOpen(false); queue(prompts[2].prompt); } },
    { label: "Open current plan", hint: "Work", action: () => { setCommandOpen(false); setView("work"); } },
    { label: "Browse library", hint: "Outputs", action: () => { setCommandOpen(false); setView("library"); } },
    { label: "New conversation", hint: "Research", action: () => { setCommandOpen(false); void newConversation(); } },
  ].filter((x) => x.label.toLowerCase().includes(commandQuery.trim().toLowerCase()));
  const commandSessions = sessions.filter((s) => `${s.title || ""} ${s.preview || ""}`.toLowerCase().includes(commandQuery.trim().toLowerCase())).slice(0, 6);
  const commandArtifacts = artifacts.filter((a) => `${artifactName(a.path)} ${a.path}`.toLowerCase().includes(commandQuery.trim().toLowerCase())).slice(0, 6);

  const envLabel = environment === "research" ? "Research" : "Production";
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();

  function Overview() {
    return <div className={styles.overview}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.greeting}>{greeting}</span>
          <div className={styles.heroStatus}><span className={`${styles.workPill} ${isWorking ? styles.working : ""}`}><i />{isWorking ? "Hermes is working" : sessionState === "offline" ? "Hermes unavailable" : "Hermes is idle"}</span><span>{envLabel}</span></div>
          <h1>{currentTitle}</h1>
          <p>{currentDetail}</p>
          <div className={styles.heroActions}><button className={styles.primary} onClick={() => queue(prompts[0].prompt)}>Continue with Hermes</button><button className={styles.secondary} onClick={() => { setView("chat"); if (!interactive) setEnvironment("research"); }}>Ask Hermes</button></div>
        </div>
        <aside className={`${styles.needsPanel} ${blockers.state === "needs" ? styles.needsAttention : ""}`}>
          <span>Needs you</span><strong>{blockers.title}</strong><p>{blockers.body}</p>{blockers.state === "unknown" && <button onClick={() => queue(MISSION_PROMPT, true)}>Refresh current plan</button>}{blockers.state === "needs" && <button onClick={() => setView("work")}>Open details</button>}
        </aside>
      </section>

      <section className={styles.nextBand}>
        <div><span>Next</span><strong>{!noValue(mission?.next) ? mission!.next : "No next step reported yet"}</strong><p>{mission ? "From Hermes' latest plan snapshot." : "Refresh the plan to let Hermes report the next step from persisted state."}</p></div>
        <button onClick={() => setView("work")}>View plan <span>→</span></button>
      </section>

      {selected && <section className={styles.continueBand}><div><span>Continue where you left off</span><strong>{selected.title || selected.preview || "Recent conversation"}</strong><p>Last activity {fmt(selected.updated_at || selected.started_at || selected.created_at)}</p></div><button onClick={() => openSession(sid(selected))}>Open conversation</button></section>}

      <div className={styles.homeGrid}>
        <section className={styles.simpleSection}><header><div><span>Recent activity</span><h2>What Hermes has been doing</h2></div><button onClick={() => setView("work")}>View all</button></header>{allActivity.length === 0 ? <div className={styles.empty}>No activity is loaded yet.</div> : <div className={styles.activityRows}>{allActivity.slice(0, 5).map((a) => <button key={a.id} onClick={() => setView("work")}><i className={styles[`dot_${a.state}`]} /><div><strong>{a.label}</strong><p>{a.detail || "Hermes activity"}</p></div><time>{fmt(a.at)}</time></button>)}</div>}</section>
        <section className={styles.simpleSection}><header><div><span>Recent work</span><h2>Conversations</h2></div><button onClick={() => setConversationOpen(true)}>Browse all</button></header>{sessions.length === 0 ? <div className={styles.empty}>{sessionState === "loading" ? "Loading conversations…" : sessionError || "No conversations returned."}</div> : <div className={styles.sessionRows}>{sessions.slice(0, 5).map((s) => <button key={sid(s)} onClick={() => openSession(sid(s))}><div><strong>{s.title || s.preview || "Untitled conversation"}</strong><p>{s.preview || "Hermes conversation"}</p></div><time>{fmt(s.updated_at || s.started_at || s.created_at)}</time></button>)}</div>}</section>
      </div>
    </div>;
  }

  function MessageRow({ message, index }: { message: Message; index: number }) {
    const role = String(message.role || "unknown").toLowerCase(); const body = messageText(message); const toolLike = role === "tool" || Boolean(message.tool_name);
    if (toolLike) return <details className={styles.toolRow}><summary><span>Hermes used {human(String(message.tool_name || message.name || "tool"))}</span><time>{fmt(message.created_at || message.timestamp)}</time></summary><p>{short(body, 600) || "Tool activity recorded."}</p><details><summary>Technical details</summary><pre>{body || JSON.stringify(message, null, 2)}</pre></details></details>;
    return <article className={`${styles.message} ${styles[`role_${role}`] || ""}`}><div className={styles.avatar}>{role === "assistant" ? "H" : role === "user" ? "Y" : "•"}</div><div className={styles.messageBody}><header><strong>{role === "assistant" ? "Hermes" : role === "user" ? "You" : human(role)}</strong><time>{fmt(message.created_at || message.timestamp)}</time></header><div className={styles.messageText}>{body || (message.tool_calls?.length ? "Hermes recorded tool activity." : "No textual content")}</div>{Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && <details className={styles.toolCalls}><summary>Hermes used {message.tool_calls.length} tool{message.tool_calls.length === 1 ? "" : "s"}</summary><div>{message.tool_calls.map((call, i) => { const r = asRecord(call); const fn = asRecord(r?.function); return <p key={i}><strong>{human(String(r?.name || fn?.name || "Tool"))}</strong><span>{short(r?.arguments ?? fn?.arguments, 180)}</span></p>; })}</div></details>}</div></article>;
  }

  function Chat() {
    return <section className={styles.chatPage}>
      <header className={styles.chatHeader}><button onClick={() => setConversationOpen(true)}>☰ Conversations</button><div><strong>{selected?.title || selected?.preview || (interactive ? "New conversation" : "Select a conversation")}</strong><span>{selected ? `Last activity ${fmt(selected.updated_at || selected.started_at || selected.created_at)}` : envLabel}</span></div><details><summary aria-label="Conversation actions">•••</summary><nav><button disabled={!selectedId} onClick={exportConversation}>Export</button>{interactive && <button disabled={!selectedId} onClick={() => { setRenameValue(String(selected?.title || "")); setRenameOpen(true); }}>Rename</button>}{interactive && <button disabled={!selectedId} onClick={fork}>Branch</button>}</nav></details></header>
      {!interactive && <div className={styles.protectedBanner}><div><strong>Production is protected</strong><span>You can inspect approved Hermes work here, but this interface cannot change it.</span></div><button onClick={() => setEnvironment("research")}>Continue in Research</button></div>}
      <div className={styles.thread}>
        {!selectedId && !messagesBusy && <div className={styles.chatEmpty}><div>H</div><h2>{interactive ? "What should Hermes work on?" : "Choose previous work to inspect"}</h2><p>{interactive ? "Start a conversation or open previous work. Hermes keeps the persistent context underneath." : "Open Conversations to inspect production history."}</p>{interactive && <button className={styles.primary} onClick={newConversation}>New conversation</button>}</div>}
        {messagesBusy && messages.length === 0 && <div className={styles.loading}>Loading conversation…</div>}
        {messages.map((m, i) => <MessageRow key={String(m.id ?? i)} message={m} index={i} />)}
        {streaming && <article className={`${styles.message} ${styles.role_assistant}`}><div className={styles.avatar}>H</div><div className={styles.messageBody}><header><strong>Hermes</strong><span className={styles.live}><i />Working</span></header><div className={styles.messageText}>{streamText || "Hermes is using its tools…"}</div>{allActivity[0] && <details className={styles.liveDetails}><summary>View live activity</summary><p>{allActivity[0].label}</p></details>}</div></article>}
        <div ref={endRef} />
      </div>
      {interactive ? <div className={styles.composerWrap}>{streaming && <div className={styles.runBar}><div><i /><span><strong>Hermes is working</strong>{allActivity[0]?.label || "Processing your instruction"}</span></div>{activeRunId && <details><summary>Guide run</summary><div><input value={steerText} onChange={(e) => setSteerText(e.target.value)} placeholder="Add guidance…" /><button disabled={!steerText.trim()} onClick={steer}>Send</button></div></details>}</div>}<form className={styles.composer} onSubmit={submit}><textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={composerKey} placeholder="Ask Hermes anything about its current work…" /><div><div className={styles.promptChips}>{prompts.map((p) => <button type="button" key={p.label} disabled={streaming} onClick={() => void send(p.prompt)}>{p.short}</button>)}</div>{streaming ? <button type="button" className={styles.stop} disabled={!activeRunId} onClick={stop}>{activeRunId ? "Stop" : "Working…"}</button> : <button className={styles.send} disabled={!draft.trim()}>Send <kbd>⌘↵</kbd></button>}</div></form></div> : <div className={styles.readOnlyFooter}><span>Production is read-only.</span><button onClick={() => setEnvironment("research")}>Work with Hermes in Research</button></div>}
    </section>;
  }

  function Work() {
    return <div className={styles.workPage}>
      <section className={styles.planCard}><header><div><span>Current plan</span><h1>What Hermes is trying to achieve</h1></div>{interactive && <button disabled={missionPending || streaming} onClick={() => queue(MISSION_PROMPT, true)}>{missionPending ? "Refreshing…" : "Refresh plan"}</button>}</header>{!mission ? <div className={styles.planEmpty}><strong>No current plan snapshot</strong><p>Ask Hermes to inspect its persisted work and summarize the plan. The OS will not invent this state.</p>{interactive ? <button className={styles.primary} onClick={() => queue(MISSION_PROMPT, true)}>Ask Hermes for current plan</button> : <button className={styles.secondary} onClick={() => setEnvironment("research")}>Switch to Research</button>}</div> : <div className={styles.planLayout}><div className={styles.objective}><span>Current objective</span><h2>{mission.objective}</h2><small>Updated {fmt(mission.at)}</small></div><div className={styles.planPair}><article><span>In progress</span><p>{mission.inProgress}</p></article><article><span>Next</span><p>{mission.next}</p></article></div><article className={`${styles.blockerCard} ${blockers.state === "needs" ? styles.needsAttention : ""}`}><span>Needs you</span><strong>{blockers.title}</strong><p>{blockers.body}</p></article><details className={styles.planMore}><summary>Completed work & context</summary><div><article><span>Completed</span><p>{mission.completed}</p></article><article><span>Important context</span><p>{mission.context}</p></article></div></details></div>}</section>
      <section className={styles.timeline}><header><div><span>Activity</span><h2>How the work unfolded</h2></div><button onClick={() => setView("chat")}>Open conversation</button></header>{allActivity.length === 0 ? <div className={styles.empty}>No activity loaded yet.</div> : allActivity.slice(0, 24).map((a) => <article key={a.id}><i className={styles[`dot_${a.state}`]} /><div><time>{fmt(a.at)}</time><strong>{a.label}</strong>{a.detail && <p>{a.detail}</p>}<details><summary>Technical event</summary><pre>{a.type}</pre></details></div></article>)}</section>
    </div>;
  }

  function Library() {
    return <div className={styles.libraryPage}>
      <header className={styles.libraryHeader}><div><span>Knowledge & output</span><h1>Your Hermes library</h1><p>Research, backtests, datasets and other outputs detected from the selected Hermes conversation.</p></div><button className={styles.secondary} onClick={() => setCommandOpen(true)}>Search Hermes</button></header>
      <section className={styles.librarySection}><header><span>Recent output</span><h2>Artifacts</h2></header>{artifacts.length === 0 ? <div className={styles.emptyLarge}><strong>No outputs detected</strong><p>Hermes Control only shows real paths that appear in Hermes messages or tool activity.</p><button onClick={() => setView("chat")}>Open conversation</button></div> : <div className={styles.fileGrid}>{artifacts.map((a) => <button key={a.path} onClick={() => setSelectedArtifact(a)}><div className={styles.fileBadge}>{a.kind.slice(0, 3).toUpperCase()}</div><div><strong>{artifactName(a.path)}</strong><span>{artifactType(a.kind)}</span><small>{a.source === "live" ? "Live Hermes activity" : "Current conversation"}</small></div></button>)}</div>}</section>
      <section className={styles.librarySection}><header><span>Hermes brain</span><h2>Capabilities</h2></header><div className={styles.capabilityBar}><div><strong>{status?.skills.state === "connected" ? skills.length : "—"}</strong><span>Skills</span></div><div><strong>{status?.toolsets.state === "connected" ? toolsets.length : "—"}</strong><span>Toolsets</span></div><p>Brain details are intentionally secondary here.</p><Link href="/brain/lab">Open Brain Lab →</Link></div>{capabilities.length > 0 && <details className={styles.capabilities}><summary>Browse reported capabilities</summary><div>{capabilities.slice(0, 24).map((c) => <article key={c.id}><span>{c.type}</span><strong>{human(c.name)}</strong><p>{c.description || "No description supplied by Hermes."}</p></article>)}</div></details>}</section>
    </div>;
  }

  return <div className={styles.shell}>
    <header className={styles.appBar}>
      <div className={styles.brandArea}><Link href="/" className={styles.brand}><b>H</b><span><strong>Hermes</strong><small>Investment OS</small></span></Link><span className={styles.divider} /><strong className={styles.productName}>Control</strong></div>
      <nav className={styles.mainNav}>{(["overview", "chat", "work", "library"] as View[]).map((v) => <button key={v} className={view === v ? styles.navActive : ""} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</nav>
      <div className={styles.appActions}><button className={styles.commandButton} onClick={() => setCommandOpen(true)}><span>Search</span><kbd>⌘K</kbd></button><div className={styles.envSwitch}><button className={environment === "research" ? styles.envActive : ""} onClick={() => setEnvironment("research")}>Research</button><button className={environment === "production" ? `${styles.envActive} ${styles.production}` : ""} onClick={() => setEnvironment("production")}>Production</button></div><Connection state={environmentState} /><button className={styles.more} aria-label="Technical details" onClick={() => setTechnicalOpen(true)}>•••</button></div>
    </header>

    {notice && <div className={styles.notice}><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}>×</button></div>}
    {sessionState === "offline" && <div className={styles.offline}><div><strong>{interactive ? "Research isn't connected" : "Hermes history is unavailable"}</strong><span>The OS remains available, but live Hermes actions for this environment are unavailable.</span></div><button onClick={() => void loadSessions(environment, "")}>Retry</button></div>}

    <main className={styles.main}>{view === "overview" ? <Overview /> : view === "chat" ? <Chat /> : view === "work" ? <Work /> : <Library />}</main>

    <nav className={styles.mobileNav}>{(["overview", "chat", "work", "library"] as View[]).map((v) => <button key={v} className={view === v ? styles.mobileActive : ""} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</nav>

    {conversationOpen && <div className={styles.backdrop} onMouseDown={() => setConversationOpen(false)}><aside className={styles.drawer} onMouseDown={(e) => e.stopPropagation()}><header><div><span>History</span><h2>Conversations</h2></div><button onClick={() => setConversationOpen(false)}>×</button></header>{interactive && <button className={styles.newConversation} onClick={newConversation}>＋ New conversation</button>}<form className={styles.drawerSearch} onSubmit={(e) => { e.preventDefault(); void loadSessions(environment, sessionSearch); }}><input autoFocus value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} placeholder="Search conversations…" /><button>Search</button></form><div className={styles.drawerList}>{sessions.map((s) => <button key={sid(s)} className={selectedId === sid(s) ? styles.drawerActive : ""} onClick={() => openSession(sid(s))}><strong>{s.title || s.preview || "Untitled conversation"}</strong><p>{s.preview || "Hermes conversation"}</p><time>{fmt(s.updated_at || s.started_at || s.created_at)}</time></button>)}{sessions.length === 0 && <div className={styles.drawerEmpty}>{sessionState === "loading" ? "Loading…" : sessionError || "No conversations found."}</div>}</div></aside></div>}

    {technicalOpen && <div className={styles.backdrop} onMouseDown={() => setTechnicalOpen(false)}><aside className={styles.drawer} onMouseDown={(e) => e.stopPropagation()}><header><div><span>Advanced</span><h2>Technical details</h2></div><button onClick={() => setTechnicalOpen(false)}>×</button></header><div className={styles.technicalList}><section><span>Environment</span><strong>{envLabel}</strong><code>{interactive ? "his-research" : "his-production"}</code></section><section><span>Connection</span><Connection state={environmentState} /><code>{environmentState || "unknown"}</code></section><section><span>Conversation</span><strong>{selected?.title || selected?.preview || "None selected"}</strong><code>{selectedId || "No session ID"}</code></section><section><span>Model</span><strong>{selected?.model || status?.production.model || "Not reported"}</strong></section><section><span>Active run</span><strong>{activeRunId ? "Running" : "None"}</strong><code>{activeRunId || "No active run ID"}</code></section><section><span>Inventory</span><strong>{status?.skills.state === "connected" ? `${skills.length} skills` : "Skills unavailable"}</strong><strong>{status?.toolsets.state === "connected" ? `${toolsets.length} toolsets` : "Toolsets unavailable"}</strong></section>{technicalError && <section><span>Last error</span><code>{technicalError}</code></section>}<section><span>Broker execution</span><strong>Locked outside Hermes Control</strong></section></div></aside></div>}

    {commandOpen && <div className={styles.commandBackdrop} onMouseDown={() => setCommandOpen(false)}><div className={styles.commandPalette} onMouseDown={(e) => e.stopPropagation()}><div className={styles.commandInput}><span>⌕</span><input ref={commandRef} value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} placeholder="Search Hermes or run a command…" /><kbd>Esc</kbd></div><div className={styles.commandResults}>{commandItems.length > 0 && <section><span>Actions</span>{commandItems.map((x) => <button key={x.label} onClick={x.action}><strong>{x.label}</strong><small>{x.hint}</small></button>)}</section>}{commandSessions.length > 0 && <section><span>Conversations</span>{commandSessions.map((s) => <button key={sid(s)} onClick={() => openSession(sid(s))}><strong>{s.title || s.preview || "Untitled conversation"}</strong><small>{fmt(s.updated_at || s.started_at || s.created_at)}</small></button>)}</section>}{commandArtifacts.length > 0 && <section><span>Outputs</span>{commandArtifacts.map((a) => <button key={a.path} onClick={() => { setSelectedArtifact(a); setCommandOpen(false); setView("library"); }}><strong>{artifactName(a.path)}</strong><small>{artifactType(a.kind)}</small></button>)}</section>}</div><footer><span>Searches currently loaded Hermes data.</span><Link href="/brain/lab">Brain Lab</Link></footer></div></div>}

    {selectedArtifact && <div className={styles.backdrop} onMouseDown={() => setSelectedArtifact(null)}><aside className={styles.drawer} onMouseDown={(e) => e.stopPropagation()}><header><div><span>{artifactType(selectedArtifact.kind)}</span><h2>{artifactName(selectedArtifact.path)}</h2></div><button onClick={() => setSelectedArtifact(null)}>×</button></header><div className={styles.technicalList}><section><span>Detected from</span><strong>{selectedArtifact.source === "live" ? "Live Hermes activity" : "Current conversation"}</strong></section><section><span>Related conversation</span><strong>{selected?.title || selected?.preview || "Not available"}</strong></section><section><span>File type</span><strong>{artifactType(selectedArtifact.kind)}</strong><code>.{selectedArtifact.kind}</code></section><section><span>Raw path</span><code>{selectedArtifact.path}</code></section></div></aside></div>}

    {renameOpen && <div className={styles.commandBackdrop} onMouseDown={() => setRenameOpen(false)}><div className={styles.rename} onMouseDown={(e) => e.stopPropagation()}><span>Conversation</span><h2>Rename</h2><input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void rename(); }} /><div><button className={styles.secondary} onClick={() => setRenameOpen(false)}>Cancel</button><button className={styles.primary} disabled={!renameValue.trim()} onClick={rename}>Save</button></div></div></div>}
  </div>;
}
