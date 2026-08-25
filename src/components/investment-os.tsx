"use client";

import { useEffect, useMemo, useState } from "react";

type Section = "dashboard" | "markets" | "agents" | "trades" | "strategy" | "risk" | "scheduler" | "memory";
type Health = { mode?: "mock" | "live"; status?: string; ready?: boolean; message?: string };
type Run = { run_id: string; status: string; output?: string; mock?: boolean };
type Job = { id?: string; name?: string; schedule?: string; enabled?: boolean; next?: string };

const nav: Array<{ id: Section; label: string; icon: string }> = [
  { id: "dashboard", label: "Command Center", icon: "⌂" }, { id: "markets", label: "Markets", icon: "⌁" },
  { id: "agents", label: "Agents", icon: "◎" }, { id: "trades", label: "Trades", icon: "↗" },
  { id: "strategy", label: "Strategy Lab", icon: "◇" }, { id: "risk", label: "Risk Center", icon: "◉" },
  { id: "scheduler", label: "Scheduler", icon: "◷" }, { id: "memory", label: "Memory", icon: "▤" },
];
const markets = [
  { symbol: "NQ", name: "Nasdaq 100", price: "—", change: "Awaiting feed", trend: "WATCH" },
  { symbol: "ES", name: "S&P 500", price: "—", change: "Awaiting feed", trend: "WATCH" },
  { symbol: "GC", name: "Gold", price: "—", change: "Awaiting feed", trend: "WATCH" },
  { symbol: "CL", name: "Crude Oil", price: "—", change: "Awaiting feed", trend: "WATCH" },
];
const agents = [
  { name: "Hermes CIO", role: "Orchestrator", state: "READY", detail: "Final synthesis & approvals", accent: true },
  { name: "Data Watcher", role: "Market Data", state: "IDLE", detail: "LYNX/TWS feed target" },
  { name: "Futures TA", role: "Technical", state: "IDLE", detail: "Structure, momentum, volatility" },
  { name: "Macro & News", role: "Context", state: "IDLE", detail: "Events, releases, sentiment" },
  { name: "Risk Guard", role: "Veto Layer", state: "ARMED", detail: "Can reduce or reject only" },
];
const trades = [
  { symbol: "NQ", side: "LONG", result: "+3.00R", state: "DEMO", reason: "Liquidity sweep + reclaim" },
  { symbol: "ES", side: "SHORT", result: "-1.00R", state: "DEMO", reason: "Failed breakout" },
  { symbol: "NQ", side: "WATCH", result: "PASS", state: "DEMO", reason: "Macro veto" },
];
function formatTime(date: Date) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }

export function InvestmentOS() {
  const [section, setSection] = useState<Section>("dashboard");
  const [health, setHealth] = useState<Health>({ status: "checking" });
  const [now, setNow] = useState(new Date());
  const [command, setCommand] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [killBusy, setKillBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function refreshHealth() { try { const response = await fetch("/api/hermes/health", { cache: "no-store" }); setHealth(await response.json()); } catch { setHealth({ status: "unreachable", ready: false, mode: "mock" }); } }
  async function refreshJobs() { try { const response = await fetch("/api/hermes/jobs", { cache: "no-store" }); const data = await response.json(); setJobs(Array.isArray(data.jobs) ? data.jobs : Array.isArray(data.jobs?.jobs) ? data.jobs.jobs : []); } catch { setJobs([]); } }

  useEffect(() => { refreshHealth(); refreshJobs(); const clock = window.setInterval(() => setNow(new Date()), 1000); const healthTimer = window.setInterval(refreshHealth, 15000); return () => { clearInterval(clock); clearInterval(healthTimer); }; }, []);
  useEffect(() => { if (!run || ["completed", "failed", "cancelled"].includes(run.status) || run.run_id.startsWith("mock_")) return; const timer = window.setInterval(async () => { const response = await fetch(`/api/hermes/runs/${run.run_id}`, { cache: "no-store" }); const data = await response.json(); setRun(data); if (["completed", "failed", "cancelled"].includes(data.status)) setRunning(false); }, 1600); return () => clearInterval(timer); }, [run]);

  const connectionLabel = health.mode === "live" && health.ready ? "HERMES ONLINE" : health.mode === "mock" ? "DEMO / MOCK" : "HERMES OFFLINE";
  const connectionClass = health.mode === "live" && health.ready ? "ok" : health.mode === "mock" ? "warn" : "danger";
  const pageTitle = useMemo(() => nav.find((item) => item.id === section)?.label || "Command Center", [section]);

  async function execute(input: string) {
    const clean = input.trim(); if (!clean || running) return; setRunning(true); setRun(null);
    try { const response = await fetch("/api/hermes/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: clean }) }); const data = await response.json(); setRun(data); setCommand(""); if (data.status === "completed" || data.error) setRunning(false); }
    catch (error) { setRun({ run_id: "local_error", status: "failed", output: error instanceof Error ? error.message : "Request failed" }); setRunning(false); }
  }
  async function hardLockTrading() {
    setKillBusy(true); setBanner(null);
    try { const response = await fetch("/api/risk/trading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) }); const data = await response.json(); setBanner(data.message || (response.ok ? "Trading disabled." : "Execution remains locked.")); }
    catch { setBanner("Execution control is unreachable. Treat trading as disabled until manually verified."); } finally { setKillBusy(false); }
  }

  return <div className="os-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">H</div><div><strong>HERMES</strong><span>INVESTMENT OS</span></div></div>
      <nav className="nav-list">{nav.map((item) => <button key={item.id} className={section === item.id ? "nav-item active" : "nav-item"} onClick={() => setSection(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="system-mini"><span className={`status-dot ${connectionClass}`} /><div><strong>{connectionLabel}</strong><span>{health.message || "Control plane ready"}</span></div></div><div className="execution-lock"><span>EXECUTION</span><strong>LOCKED</strong></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">HERMES INVESTMENT SPECIALIST</span><h1>{pageTitle}</h1></div><div className="top-actions"><div className="clock"><span>EUROPE / AMSTERDAM</span><strong>{formatTime(now)}</strong></div><button className="ghost-button" onClick={() => setChatOpen(true)}>Open CIO</button><div className={`connection-pill ${connectionClass}`}><span />{connectionLabel}</div></div></header>
      {banner && <div className="banner"><span>!</span>{banner}<button onClick={() => setBanner(null)}>×</button></div>}
      <div className="content">
        {section === "dashboard" && <Dashboard run={run} running={running} command={command} setCommand={setCommand} execute={execute} health={health} />}
        {section === "markets" && <Markets />}{section === "agents" && <Agents run={run} />}{section === "trades" && <Trades />}{section === "strategy" && <Strategy />}{section === "risk" && <Risk onKill={hardLockTrading} busy={killBusy} />}{section === "scheduler" && <Scheduler jobs={jobs} refresh={refreshJobs} />}{section === "memory" && <Memory />}
      </div>
    </main>
    <button className="cio-fab" onClick={() => setChatOpen(true)}><span>H</span><div><strong>Hermes CIO</strong><small>{running ? "Run active" : "Ask or command"}</small></div></button>
    {chatOpen && <div className="drawer-backdrop" onMouseDown={() => setChatOpen(false)}><aside className="cio-drawer" onMouseDown={(e) => e.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">PRIMARY ORCHESTRATOR</span><h2>Hermes CIO</h2></div><button onClick={() => setChatOpen(false)}>×</button></div><div className="cio-thread"><div className="message hermes"><span>H</span><p>I am the control interface for Hermes Investment Specialist. In demo mode I never fabricate live prices. Connect your Hermes API to activate real runs.</p></div>{run?.output && <div className="message hermes"><span>H</span><p>{run.output}</p></div>}{running && <div className="message hermes"><span>H</span><p className="typing">Hermes run active <i>·</i><i>·</i><i>·</i></p></div>}</div><div className="drawer-shortcuts">{["Run pre-market scan", "Analyze NQ", "Check portfolio risk", "Review today"].map((x) => <button key={x} onClick={() => execute(x)}>{x}</button>)}</div><form className="drawer-input" onSubmit={(e) => { e.preventDefault(); execute(command); }}><textarea value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Ask Hermes CIO..." rows={3} /><button disabled={running || !command.trim()}>{running ? "RUNNING" : "SEND"}</button></form></aside></div>}
  </div>;
}

function Dashboard({ run, running, command, setCommand, execute, health }: { run: Run | null; running: boolean; command: string; setCommand: (v: string) => void; execute: (v: string) => void; health: Health }) {
  return <div className="dashboard-grid">
    <section className="hero-card grid-span-8"><div className="hero-top"><div><span className="eyebrow">SYSTEM POSTURE</span><div className="hero-status"><span className="pulse" />ANALYSIS READY</div></div><span className="mode-badge">{health.mode === "live" && health.ready ? "LIVE HERMES" : "SAFE DEMO"}</span></div><h2>Capital preservation first.<br /><em>Opportunity second.</em></h2><p>One command plane for market research, multi-agent analysis, risk vetoes and controlled execution.</p><div className="quick-actions"><button className="primary-button" onClick={() => execute("Run the complete pre-market CIO workflow for NQ, ES, GC and CL. Do not force a trade.")}>Run Pre-Market Scan <b>↗</b></button><button onClick={() => execute("Analyze NQ now using the current approved investment workflow. Never fabricate market data.")}>Analyze NQ</button><button onClick={() => execute("Run Risk Guard against current portfolio exposure and report any veto conditions.")}>Check Risk</button></div></section>
    <section className="metric-card grid-span-4 risk-summary"><div className="card-head"><span>PORTFOLIO RISK</span><small>DEMO STATE</small></div><div className="risk-number">0<span>.00%</span></div><div className="risk-bar"><i style={{ width: "0%" }} /></div><div className="risk-row"><span>Open risk</span><strong>$0</strong></div><div className="risk-row"><span>Daily loss</span><strong>$0 / —</strong></div><div className="risk-row"><span>Execution permission</span><strong className="red">LOCKED</strong></div></section>
    <section className="market-strip grid-span-12">{markets.map((market) => <div className="market-cell" key={market.symbol}><div><strong>{market.symbol}</strong><span>{market.name}</span></div><div className="market-price">{market.price}<span>{market.change}</span></div><small>{market.trend}</small></div>)}</section>
    <section className="panel grid-span-7 command-panel"><div className="panel-head"><div><span className="eyebrow">COMMAND TERMINAL</span><h3>Direct Hermes Control</h3></div><span className={running ? "run-state active" : "run-state"}>{running ? "RUNNING" : "READY"}</span></div><div className="terminal-output">{run ? <><div className="terminal-meta"><span>{run.run_id}</span><strong>{run.status.toUpperCase()}</strong></div><p>{run.output || "Run accepted. Waiting for Hermes output…"}</p></> : <p className="muted">No active run. Start an analysis or send a direct instruction to Hermes CIO.</p>}</div><form className="command-form" onSubmit={(e) => { e.preventDefault(); execute(command); }}><input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="e.g. Analyze NQ and explain every veto condition" /><button disabled={running || !command.trim()}>RUN</button></form></section>
    <section className="panel grid-span-5"><div className="panel-head"><div><span className="eyebrow">AGENT MESH</span><h3>Operational State</h3></div><small>5 nodes</small></div><div className="agent-list compact">{agents.map((agent, index) => <div className="agent-row" key={agent.name}><span className={index === 0 ? "agent-orb active" : "agent-orb"}>{index === 0 ? "H" : index}</span><div><strong>{agent.name}</strong><small>{agent.role}</small></div><b>{index === 0 && running ? "ACTIVE" : agent.state}</b></div>)}</div></section>
  </div>;
}
function Markets() { return <div className="stack"><section className="section-intro"><span className="eyebrow">MARKET UNIVERSE</span><h2>Evidence before opinion.</h2><p>Prices stay blank until a verified market-data source is connected. The OS will never invent live quotes.</p></section><div className="market-grid">{markets.map((m) => <article className="market-detail" key={m.symbol}><header><div><strong>{m.symbol}</strong><span>{m.name}</span></div><small>NO FEED</small></header><div className="empty-chart"><div /><div /><div /><div /><span>LYNX / TWS market data target</span></div><footer><div><span>Trend</span><strong>UNKNOWN</strong></div><div><span>RSI 14</span><strong>—</strong></div><div><span>ATR</span><strong>—</strong></div><div><span>Data age</span><strong>—</strong></div></footer></article>)}</div></div>; }
function Agents({ run }: { run: Run | null }) { return <div className="stack"><section className="section-intro"><span className="eyebrow">MULTI-AGENT CONTROL PLANE</span><h2>One CIO. Four specialist guards.</h2><p>Worker agents provide evidence. Hermes CIO is the only layer that synthesizes and communicates final decisions.</p></section><div className="agent-cards">{agents.map((a, i) => <article className={a.accent ? "agent-card lead" : "agent-card"} key={a.name}><div className="agent-card-top"><span className="big-orb">{i === 0 ? "H" : `0${i}`}</span><span className={i === 0 && run?.status === "started" ? "live-tag" : "idle-tag"}>{i === 0 && run?.status === "started" ? "RUNNING" : a.state}</span></div><h3>{a.name}</h3><p>{a.detail}</p><footer><span>{a.role}</span><b>{i === 4 ? "VETO AUTHORITY" : i === 0 ? "FINAL AUTHORITY" : "EVIDENCE ONLY"}</b></footer></article>)}</div></div>; }
function Trades() { return <div className="stack"><section className="section-intro"><span className="eyebrow">AUDIT TRAIL</span><h2>Every trade must explain itself.</h2><p>Production trades will be immutable records linking strategy evidence, agent reports, risk decisions and broker execution.</p></section><section className="table-panel"><div className="table-head"><span>INSTRUMENT</span><span>SIDE</span><span>OUTCOME</span><span>RATIONALE</span><span>STATE</span></div>{trades.map((t, i) => <div className="trade-row" key={i}><strong>{t.symbol}</strong><span>{t.side}</span><b className={t.result.startsWith("+") ? "green" : t.result.startsWith("-") ? "red" : "muted-text"}>{t.result}</b><span>{t.reason}</span><small>{t.state}</small></div>)}</section><div className="info-callout"><strong>Demo records only</strong><p>No broker account is connected. Live trade history will only appear after LYNX/TWS integration and execution reconciliation are implemented.</p></div></div>; }
function Strategy() { return <div className="stack"><section className="section-intro"><span className="eyebrow">STRATEGY VALIDATION</span><h2>AI cannot promote its own ideas.</h2><p>A strategy moves to execution only after deterministic backtesting, locked out-of-sample validation and paper/live promotion gates.</p></section><div className="strategy-layout"><article className="strategy-card"><div className="strategy-title"><div><span>NQ</span><h3>Liquidity Framework</h3></div><b>RESEARCH</b></div><div className="version">v0.1 · production locked</div><div className="rule-list"><div><span>01</span><p>Higher-timeframe point of interest</p></div><div><span>02</span><p>Engineered liquidity / sweep</p></div><div><span>03</span><p>Displacement confirmation</p></div><div><span>04</span><p>Defined invalidation & target liquidity</p></div></div></article><article className="validation-card"><span className="eyebrow">PROMOTION LADDER</span>{["Backtest", "Locked OOS", "LYNX Paper", "Shadow Live", "Micro Live", "Scale"].map((step, i) => <div className="promotion-row" key={step}><span>{String(i + 1).padStart(2, "0")}</span><strong>{step}</strong><b>{i === 0 ? "NEXT" : "LOCKED"}</b></div>)}</article></div></div>; }
function Risk({ onKill, busy }: { onKill: () => void; busy: boolean }) { return <div className="stack"><section className="section-intro"><span className="eyebrow">RISK CENTER</span><h2>The layer Hermes cannot overrule.</h2><p>Execution controls belong outside the LLM. In this v1 build, broker execution is hard-locked by default.</p></section><div className="risk-layout"><article className="risk-gauge-card"><span className="eyebrow">SYSTEM RISK</span><div className="gauge"><div><strong>0</strong><span>/ 100</span><small>NO LIVE EXPOSURE</small></div></div><p>Risk cannot be calculated until account state and verified market data are connected.</p></article><article className="limits-card"><div className="limit-row"><span>Max daily loss</span><strong>NOT CONFIGURED</strong></div><div className="limit-row"><span>Open portfolio risk</span><strong>0.00%</strong></div><div className="limit-row"><span>Equity index bucket</span><strong>0.00%</strong></div><div className="limit-row"><span>Consecutive losses</span><strong>0</strong></div><div className="limit-row"><span>Realtime data</span><strong className="red">NOT CONNECTED</strong></div><div className="limit-row"><span>Broker execution</span><strong className="red">HARD LOCK</strong></div></article><article className="kill-card"><span>EMERGENCY CONTROL</span><h3>Disable trading</h3><p>This calls the external execution-control service directly. Hermes does not get a vote.</p><button onClick={onKill} disabled={busy}>{busy ? "VERIFYING LOCK…" : "⛔ HARD KILL SWITCH"}</button><small>With no execution service configured, the API refuses to enable anything and reports the system locked.</small></article></div></div>; }
function Scheduler({ jobs, refresh }: { jobs: Job[]; refresh: () => void }) { return <div className="stack"><section className="section-intro row-intro"><div><span className="eyebrow">HERMES JOBS API</span><h2>Automations without the terminal.</h2><p>These map to native Hermes scheduled jobs. Live mode reads the scheduler directly from Hermes.</p></div><button className="ghost-button" onClick={refresh}>Refresh jobs</button></section><div className="jobs-list">{jobs.length ? jobs.map((job, i) => <article className="job-row" key={job.id || i}><span className={job.enabled === false ? "job-dot off" : "job-dot"} /><div><strong>{job.name || `Job ${i + 1}`}</strong><small>{job.next || "Hermes scheduled job"}</small></div><code>{job.schedule || "—"}</code><b>{job.enabled === false ? "PAUSED" : "ENABLED"}</b></article>) : <div className="empty-state">No jobs returned from Hermes.</div>}</div></div>; }
function Memory() { return <div className="stack"><section className="section-intro"><span className="eyebrow">PERSISTENT MEMORY</span><h2>Store lessons, not noise.</h2><p>Raw bars and trade histories belong in data stores. Hermes memory should contain only compact, durable investment-system knowledge.</p></section><div className="memory-grid"><article className="memory-card"><header><span>CORE POLICY</span><b>LOCKED</b></header><ul><li>Capital preservation overrides opportunity.</li><li>NQ and ES count toward one correlated equity-index risk bucket.</li><li>No price or economic number may be fabricated.</li><li>Risk Guard may reduce size or veto, never increase it.</li></ul></article><article className="memory-card"><header><span>LEARNING QUEUE</span><b>APPROVAL</b></header><div className="empty-memory"><strong>No proposed learning yet</strong><p>Strategy-changing observations should enter research first and require statistical validation before promotion.</p></div></article></div></div>; }
