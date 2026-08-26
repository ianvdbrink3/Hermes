"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  BrainEnvironment,
  BrainRun,
  BrainStatus,
  CapabilityItem,
  ImprovementRequest,
} from "@/lib/brain/types";
import styles from "./brain-studio.module.css";

type StatusResponse = BrainStatus & {
  productionPolicy?: { promotionEnabled: boolean; builderMutationEnabled: boolean; explanation: string };
};

type ConsoleMessage = {
  id: string;
  role: "user" | "hermes" | "system";
  text: string;
  at: string;
};

const researchPresets = [
  {
    label: "Analyse recent mistakes",
    prompt: "Analyseer recente fouten in je NQ-analyses. Segmenteer patronen, gebruik beschikbaar bewijs en benoem waar bewijs onvoldoende is. Ontwerp nog niets voordat de structurele zwakte duidelijk is. Verander production niet.",
  },
  {
    label: "Find capability gaps",
    prompt: "Bekijk je huidige investment capabilities en identificeer maximaal drie aantoonbare capability gaps als NQ futures analyst. Geef per gap bewijs, impact, ontbrekende data en een valide testmethode. Verander production niet.",
  },
  {
    label: "Propose one improvement",
    prompt: "Identificeer op basis van beschikbaar bewijs één structurele zwakte in je investment intelligence. Ontwerp maximaal één meetbare capability improvement met probleem, bewijs, hypothese, benodigde data, validatiemethode, succescriteria en risico's. Test of wijzig production niet.",
  },
];

const pipeline = ["RESEARCH", "PROPOSED", "BUILD", "HISTORICAL TEST", "OUT-OF-SAMPLE", "HUMAN REVIEW", "PRODUCTION"];

function statusLabel(value?: string) {
  if (!value) return "UNKNOWN";
  return value.replaceAll("_", " ").toUpperCase();
}

function nowLabel() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function StatePill({ state }: { state?: string }) {
  const clean = state || "unknown";
  return <span className={`${styles.statePill} ${styles[`state_${clean}`] || ""}`}>{statusLabel(clean)}</span>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function BrainStudio() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityItem[]>([]);
  const [capabilityState, setCapabilityState] = useState("loading");
  const [capabilityMessage, setCapabilityMessage] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "skill" | "toolset">("all");
  const [environment, setEnvironment] = useState<Extract<BrainEnvironment, "research" | "production">>("research");
  const [consoleInput, setConsoleInput] = useState("");
  const [messages, setMessages] = useState<ConsoleMessage[]>([
    { id: "welcome", role: "system", text: "Brain Studio is a controlled research interface. Production mutation and promotion are disabled in v0.3.", at: nowLabel() },
  ]);
  const [activeRun, setActiveRun] = useState<BrainRun | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [improvementGoal, setImprovementGoal] = useState("");
  const [improvements, setImprovements] = useState<ImprovementRequest[]>([]);
  const [improvementBusy, setImprovementBusy] = useState(false);
  const [selectedImprovement, setSelectedImprovement] = useState<ImprovementRequest | null>(null);

  async function loadStatus() {
    try {
      const response = await fetch("/api/brain/status", { cache: "no-store" });
      const data = await response.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }

  async function loadCapabilities() {
    setCapabilityState("loading");
    try {
      const response = await fetch("/api/brain/capabilities", { cache: "no-store" });
      const data = await response.json();
      setCapabilities(Array.isArray(data.items) ? data.items : []);
      setCapabilityState(data.state || (response.ok ? "connected" : "offline"));
      setCapabilityMessage(data.message);
    } catch {
      setCapabilities([]);
      setCapabilityState("offline");
      setCapabilityMessage("Capability endpoint is unreachable.");
    }
  }

  async function loadImprovements() {
    try {
      const response = await fetch("/api/brain/improvements", { cache: "no-store" });
      const data = await response.json();
      setImprovements(Array.isArray(data.items) ? data.items : []);
    } catch {
      setImprovements([]);
    }
  }

  useEffect(() => {
    loadStatus();
    loadCapabilities();
    loadImprovements();
  }, []);

  useEffect(() => {
    if (!activeRun || ["completed", "failed", "cancelled", "stopped"].includes(activeRun.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/brain/runs/${encodeURIComponent(activeRun.run_id)}?environment=${activeRun.environment}`, { cache: "no-store" });
        const run = await response.json() as BrainRun;
        setActiveRun(run);
        if (["completed", "failed", "cancelled", "stopped"].includes(run.status)) {
          setRunBusy(false);
          setMessages((current) => [
            ...current,
            { id: `${run.run_id}-result`, role: run.status === "completed" ? "hermes" : "system", text: run.output || run.error || `Run ${run.status}.`, at: nowLabel() },
          ]);
        }
      } catch {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `poll-error-${Date.now()}`, role: "system", text: "Lost connection while polling this Hermes run.", at: nowLabel() }]);
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [activeRun]);

  const filteredCapabilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return capabilities.filter((item) => {
      if (kind !== "all" && item.type !== kind) return false;
      if (!q) return true;
      return `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(q);
    });
  }, [capabilities, kind, query]);

  const selectedProfile = environment === "research" ? status?.research : status?.production;
  const skillsConnected = status?.skills.state === "connected";
  const toolsetsConnected = status?.toolsets.state === "connected";

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
        body: JSON.stringify({ input: clean, environment, session_id: `brain-${environment}-primary` }),
      });
      const run = await response.json() as BrainRun & { error?: string };
      setActiveRun(run);
      if (!response.ok || run.status === "failed") {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `run-error-${Date.now()}`, role: "system", text: run.error || "Hermes could not start this run.", at: nowLabel() }]);
        return;
      }
      if (run.output && run.status === "completed") {
        setRunBusy(false);
        setMessages((current) => [...current, { id: `${run.run_id}-instant`, role: "hermes", text: run.output || "Run completed.", at: nowLabel() }]);
      }
    } catch {
      setRunBusy(false);
      setMessages((current) => [...current, { id: `network-${Date.now()}`, role: "system", text: "Brain Studio could not reach the protected Hermes proxy.", at: nowLabel() }]);
    }
  }

  async function createImprovement(andResearch: boolean) {
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
      if (!response.ok || !data.item) return;
      const item = data.item as ImprovementRequest;
      setImprovements((current) => [item, ...current]);
      setSelectedImprovement(item);
      setImprovementGoal("");
      if (andResearch) {
        setEnvironment("research");
        await runConsole(`Research this improvement request:\n\n${goal}\n\nReturn one evidence-based capability proposal. Include problem, evidence, hypothesis, required data, validation method, success criteria and risks. Do not modify production.`);
      }
    } finally {
      setImprovementBusy(false);
    }
  }

  function submitConsole(event: FormEvent) {
    event.preventDefault();
    runConsole(consoleInput);
  }

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span>H</span><div><strong>HERMES</strong><small>INVESTMENT OS</small></div></Link>
      <div className={styles.navGroup}><span>OPERATIONS</span><Link href="/">Command Center</Link><Link href="/">Markets</Link><Link href="/">Agents</Link><Link href="/">Risk Center</Link></div>
      <div className={styles.navGroup}><span>INTELLIGENCE</span><div className={styles.navActive}>Brain Studio <b>v0.3</b></div><a href="#capabilities">Capabilities</a><a href="#improvements">Improvements</a><a href="#changelog">Changelog</a></div>
      <div className={styles.sidebarFoot}><div><span>PRODUCTION</span><strong>IMMUTABLE</strong></div><small>Explicit human approval is required before future promotion. v0.3 cannot mutate production.</small></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>INTELLIGENCE CONTROL PLANE</span><h1>Brain Studio</h1><p>Inspect, challenge and improve Hermes investment intelligence without silently changing production.</p></div>
        <div className={styles.headerStatus}><StatePill state={status?.production.state || "loading"} /><span>his-production</span></div>
      </header>

      <section className={styles.guardrail}>
        <strong>CONTROLLED RECURSIVE IMPROVEMENT</strong>
        <span>Research may propose. Evaluation must provide evidence. Production promotion is disabled until a durable approval and versioning layer exists.</span>
      </section>

      <div className={styles.workspace}>
        <section className={`${styles.panel} ${styles.consolePanel}`}>
          <div className={styles.panelHead}>
            <div><span className={styles.eyebrow}>HERMES BRAIN CONSOLE</span><h2>Direct intelligence interface</h2></div>
            <div className={styles.environmentSwitch}>
              <button className={environment === "research" ? styles.switchActive : ""} onClick={() => setEnvironment("research")}>RESEARCH</button>
              <button className={environment === "production" ? styles.switchActive : ""} onClick={() => setEnvironment("production")}>PRODUCTION · READ ONLY</button>
            </div>
          </div>
          <div className={styles.consoleMeta}>
            <div><span>PROFILE</span><strong>{selectedProfile?.profile || (environment === "research" ? "his-research" : "his-production")}</strong></div>
            <div><span>STATE</span><StatePill state={selectedProfile?.state || "loading"} /></div>
            <div><span>SESSION</span><strong>brain-{environment}-primary</strong></div>
            <div><span>MUTATION</span><strong className={styles.locked}>BLOCKED</strong></div>
          </div>
          <div className={styles.thread}>
            {messages.map((message) => <article key={message.id} className={`${styles.message} ${styles[`message_${message.role}`]}`}><header><strong>{message.role === "user" ? "YOU" : message.role === "hermes" ? "HERMES CIO" : "SYSTEM"}</strong><time>{message.at}</time></header><p>{message.text}</p></article>)}
            {runBusy && <article className={`${styles.message} ${styles.message_hermes}`}><header><strong>HERMES CIO</strong><time>RUNNING</time></header><p>Hermes run active. Waiting for evidence and tool output from the gateway…</p>{activeRun && <small>{activeRun.run_id} · {statusLabel(activeRun.status)}</small>}</article>}
          </div>
          <div className={styles.presetRow}>{researchPresets.map((preset) => <button key={preset.label} onClick={() => { setEnvironment("research"); setConsoleInput(preset.prompt); }}>{preset.label}</button>)}</div>
          <form className={styles.consoleForm} onSubmit={submitConsole}><textarea rows={5} value={consoleInput} onChange={(event) => setConsoleInput(event.target.value)} placeholder={environment === "research" ? "Ask Hermes to diagnose, research or propose an evidence-based improvement…" : "Inspect or challenge the current production brain. Production mutation is blocked…"} /><div><span>{environment === "research" ? "Research actions require his-research to be connected." : "Production console is explicitly read-only."}</span><button disabled={runBusy || !consoleInput.trim()}>{runBusy ? "RUNNING" : "RUN HERMES"}</button></div></form>
        </section>

        <aside className={`${styles.panel} ${styles.statusPanel}`}>
          <div className={styles.panelHead}><div><span className={styles.eyebrow}>BRAIN STATUS</span><h2>What is actually connected?</h2></div><button className={styles.refresh} onClick={() => { loadStatus(); loadCapabilities(); }}>↻</button></div>
          <div className={styles.metrics}>
            <Metric label="Skills" value={skillsConnected ? status?.skills.data.length ?? 0 : "—"} detail={skillsConnected ? "Reported by /v1/skills" : status?.skills.message || "Not connected"} />
            <Metric label="Toolsets" value={toolsetsConnected ? status?.toolsets.data.length ?? 0 : "—"} detail={toolsetsConnected ? "Reported by /v1/toolsets" : status?.toolsets.message || "Not connected"} />
            <Metric label="Model" value={status?.production.model || "—"} detail="Production gateway" />
            <Metric label="Improvements" value={improvements.length} detail="Ephemeral v0.3 drafts" />
          </div>
          <div className={styles.profileStack}>
            {[status?.research, status?.builder, status?.production].map((profile, index) => profile && <div key={profile.profile}><span>{index === 0 ? "RESEARCH" : index === 1 ? "BUILDER" : "PRODUCTION"}</span><strong>{profile.profile}</strong><StatePill state={profile.state} /></div>)}
          </div>
          <div className={styles.truthNote}><strong>No fabricated brain state.</strong><p>Unavailable endpoints remain unavailable. Counts appear only when Hermes reports them.</p></div>
        </aside>
      </div>

      <section id="capabilities" className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>CAPABILITY EXPLORER</span><h2>What Hermes can currently do</h2><p>Deterministic discovery from Hermes skills and toolsets. API feature flags are not presented as investment skills.</p></div><StatePill state={capabilityState} /></div>
        <div className={styles.filters}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills and toolsets…" /><div>{(["all", "skill", "toolset"] as const).map((filter) => <button key={filter} className={kind === filter ? styles.filterActive : ""} onClick={() => setKind(filter)}>{filter.toUpperCase()}</button>)}</div></div>
        {capabilityState !== "connected" && capabilities.length === 0 ? <div className={styles.emptyState}><strong>Capability data unavailable</strong><p>{capabilityMessage || "Hermes capability endpoints are not connected."}</p><small>Brain Studio does not substitute fixtures for production state.</small></div> : <div className={styles.capabilityGrid}>{filteredCapabilities.map((item) => <article key={item.id} className={styles.capabilityCard}><header><span>{item.type.toUpperCase()}</span><b>{item.environment.toUpperCase()}</b></header><h3>{item.name}</h3><p>{item.description}</p><footer><span>{item.category}</span>{item.type === "toolset" && <span>{item.tools?.length ?? 0} tools</span>}{item.configured === false && <strong>NOT CONFIGURED</strong>}</footer></article>)}</div>}
      </section>

      <section id="improvements" className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>SELF-IMPROVEMENT LAB</span><h2>Turn weaknesses into testable capability requests</h2><p>v0.3 creates a typed improvement request and can hand the research task to his-research when that profile is connected.</p></div><span className={styles.ephemeral}>EPHEMERAL STORAGE</span></div>
        <div className={styles.improvementLayout}>
          <div className={styles.improvementComposer}><label htmlFor="improvement-goal">What should Hermes become better at?</label><textarea id="improvement-goal" rows={6} value={improvementGoal} onChange={(event) => setImprovementGoal(event.target.value)} placeholder="Bijv. Onderzoek waarom je NQ trenddagen te vaak als mean-reversion classificeert. Gebruik bewijs en ontwerp maximaal één meetbare capability. Verander production niet." /><div className={styles.composerActions}><button onClick={() => createImprovement(false)} disabled={!improvementGoal.trim() || improvementBusy}>SAVE DRAFT</button><button className={styles.primaryAction} onClick={() => createImprovement(true)} disabled={!improvementGoal.trim() || improvementBusy}>RESEARCH & PROPOSE</button></div><small>Drafts are intentionally not treated as approved changes. Current storage is process-local and may reset on Vercel redeploy/cold start.</small></div>
          <div className={styles.pipelineCard}><span className={styles.eyebrow}>IMPROVEMENT PIPELINE</span><div className={styles.pipeline}>{pipeline.map((stage, index) => <div key={stage}><i>{index + 1}</i><strong>{stage}</strong>{index < pipeline.length - 1 && <span>→</span>}</div>)}</div><p>Only research/proposal foundations are active in v0.3. Build, evaluation, approval and production transitions remain guarded future stages.</p></div>
        </div>

        <div className={styles.improvementTable}>
          <header><span>DRAFT IMPROVEMENTS</span><b>{improvements.length}</b></header>
          {improvements.length === 0 ? <div className={styles.emptyState}><strong>No brain improvements yet.</strong><p>Ask Hermes to diagnose a weakness or enter a concrete improvement goal above.</p></div> : improvements.map((item) => <button key={item.id} onClick={() => setSelectedImprovement(item)}><div><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString()} · {item.sourceProfile} → {item.targetProfile}</small></div><StatePill state={item.status.toLowerCase()} /><span>OPEN →</span></button>)}
        </div>
      </section>

      <section id="changelog" className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>BRAIN CHANGELOG</span><h2>Production history is not chat history</h2><p>The changelog foundation is deliberately empty until versioned, durable production promotion exists.</p></div><span className={styles.lockBadge}>PRODUCTION LOCKED</span></div>
        <div className={styles.changelogEmpty}><div><strong>No production brain changes recorded by Brain Studio.</strong><p>Future entries will be append-only records of approved promotions and rollbacks. v0.3 cannot create one.</p></div><div className={styles.policyGrid}><span><small>APPROVAL</small><strong>HUMAN REQUIRED</strong></span><span><small>SKILL MUTATION</small><strong>DISABLED</strong></span><span><small>PROMOTION</small><strong>DISABLED</strong></span><span><small>ROLLBACK</small><strong>FOUNDATION ONLY</strong></span></div></div>
      </section>
    </main>

    {selectedImprovement && <div className={styles.drawerBackdrop} onMouseDown={() => setSelectedImprovement(null)}><aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}><header><div><span className={styles.eyebrow}>IMPROVEMENT REQUEST</span><h2>{selectedImprovement.title}</h2></div><button onClick={() => setSelectedImprovement(null)}>×</button></header><div className={styles.drawerMeta}><StatePill state={selectedImprovement.status.toLowerCase()} /><span>{selectedImprovement.sourceProfile}</span><span>→</span><span>{selectedImprovement.targetProfile}</span></div><section><h3>Goal</h3><p>{selectedImprovement.userGoal}</p></section><section><h3>Evidence</h3><p>{selectedImprovement.evidence.length ? selectedImprovement.evidence.join("\n") : "No evidence stored yet. A draft is not a validated improvement."}</p></section><section><h3>Validation</h3><p>{selectedImprovement.validationPlan || "Not defined yet. Historical and out-of-sample evidence will be separate future evaluation stages."}</p></section><section><h3>Production impact</h3><p>None. Builder mutation and production promotion are disabled in v0.3.</p></section><footer><button onClick={() => { setEnvironment("research"); setConsoleInput(`Research improvement ${selectedImprovement.id}: ${selectedImprovement.userGoal}\n\nCollect evidence and produce one measurable capability proposal. Do not change production.`); setSelectedImprovement(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>LOAD INTO RESEARCH CONSOLE</button></footer></aside></div>}
  </div>;
}
