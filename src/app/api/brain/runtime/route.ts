import { NextResponse } from "next/server";
import { brainHermesFetch } from "@/lib/brain/hermes-client";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function extractJobs(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return rows(payload);
  const source = record(payload);
  for (const key of ["jobs", "data", "items"]) {
    if (Array.isArray(source[key])) return rows(source[key]);
  }
  return [];
}

function pickString(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(typeof value === "number" && value < 100_000_000_000 ? value * 1000 : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFixture(value: unknown) {
  const match = String(value ?? "").match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function humanGateIsClear(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!?:;,]+$/g, "")
    .trim();
  return ["", "none", "—", "-", "n/a", "null", "nothing", "geen", "no blockers", "no human gate", "no human gates", "none required"].includes(normalized);
}

function schedulerView(job: JsonRecord | null) {
  if (!job) return null;
  const status = String(job.status || job.state || "active").toLowerCase();
  return {
    id: String(job.id || job.job_id || ""),
    name: String(job.name || "Research Review Router"),
    active: job.active !== false && job.enabled !== false && status !== "paused" && status !== "disabled",
    schedule: job.schedule || job.schedule_text || null,
    nextRun: job.next_run || job.nextRun || job.next_run_at || null,
    lastRun: job.last_run || job.lastRun || job.last_run_at || null,
    lastStatus: job.last_status || job.lastStatus || job.status || null,
  };
}

function selectScheduler(jobs: JsonRecord[]) {
  const exact = jobs.find((job) => String(job.name || "").trim().toLowerCase() === "research review router");
  if (exact) return exact;
  return jobs.find((job) => String(job.name || "").trim().toLowerCase() === "autonomous investment lab") || null;
}

function nestedCompute(snapshot: JsonRecord) {
  const runtime = record(snapshot.runtime);
  for (const value of [runtime.compute, runtime.compute_budget, snapshot.compute, snapshot.compute_budget, snapshot.budget]) {
    const candidate = record(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
}

function explicitCooldown(snapshot: JsonRecord) {
  const runtime = record(snapshot.runtime);
  const provider = record(runtime.provider);
  const cooldown = record(runtime.provider_cooldown || snapshot.provider_cooldown || provider.cooldown);
  return pickString(cooldown, ["retry_not_before_utc", "retryNotBeforeUtc", "retry_not_before", "not_before"])
    || pickString(provider, ["retry_not_before_utc", "retryNotBeforeUtc"]);
}

function computeView(snapshot: JsonRecord) {
  const source = nestedCompute(snapshot);
  return {
    available: Object.keys(source).length > 0,
    runs24h: pickNumber(source, ["runs_24h", "run_count_24h", "runs24h", "run_count"]),
    maxRuns24h: pickNumber(source, ["max_runs_24h", "max_runs", "maxRuns24h", "run_limit"]),
    promptTokens24h: pickNumber(source, ["prompt_tokens_24h", "prompt_tokens", "promptTokens24h"]),
    maxPromptTokens24h: pickNumber(source, ["max_prompt_tokens_24h", "max_prompt_tokens", "maxPromptTokens24h"]),
    totalTokens24h: pickNumber(source, ["total_tokens_24h", "total_tokens", "totalTokens24h"]),
    maxTotalTokens24h: pickNumber(source, ["max_total_tokens_24h", "max_total_tokens", "maxTotalTokens24h"]),
    openReservations: pickNumber(source, ["open_reservations", "openReservations", "open_reservations_24h"]),
    voidedReservations: pickNumber(source, ["voided_reservations", "voidedReservations", "reservation_voids"]),
    estimatedContextBytes: pickNumber(source, ["estimated_context_bytes", "context_bytes", "estimatedContextBytes"]),
    maxContextBytes: pickNumber(source, ["max_context_bytes", "context_limit_bytes", "maxContextBytes"]),
  };
}

async function fetchSnapshot() {
  const productionBase = normalizeBaseUrl(process.env.HERMES_BASE_URL || "");
  const stateUrl = normalizeBaseUrl(process.env.HERMES_AUTONOMY_STATE_URL || "") || (productionBase ? `${productionBase}/autonomy-state/snapshot` : "");
  const stateKey = process.env.HERMES_AUTONOMY_STATE_API_KEY || process.env.HERMES_RESEARCH_API_KEY || "";

  if (!stateUrl || !stateKey) return { connected: false, snapshot: {} as JsonRecord, message: "Autonomy state feed is not configured." };

  try {
    const response = await fetch(stateUrl, {
      headers: { Authorization: `Bearer ${stateKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { connected: false, snapshot: {} as JsonRecord, message: `Autonomy state feed returned HTTP ${response.status}.` };
    return { connected: true, snapshot: record(await response.json()), message: undefined };
  } catch (error) {
    return { connected: false, snapshot: {} as JsonRecord, message: error instanceof Error ? error.message : "Autonomy state feed unavailable." };
  }
}

async function fetchScheduler() {
  try {
    const response = await brainHermesFetch("research", "/api/jobs");
    if (!response.ok) return { connected: false, job: null as JsonRecord | null, message: `Research jobs returned HTTP ${response.status}.` };
    const jobs = extractJobs((await response.json()) as unknown);
    return { connected: true, job: selectScheduler(jobs), message: undefined };
  } catch (error) {
    return { connected: false, job: null as JsonRecord | null, message: error instanceof Error ? error.message : "Research scheduler unavailable." };
  }
}

export async function GET() {
  const [stateResult, schedulerResult] = await Promise.all([fetchSnapshot(), fetchScheduler()]);
  const snapshot = stateResult.snapshot;
  const current = record(snapshot.current);
  const scheduler = schedulerView(schedulerResult.job);
  const currentTask = pickString(current, ["current_task", "task_id", "task"]) || null;
  const currentFixture = parseFixture(currentTask || current.current_objective || current.in_progress);
  const compute = computeView(snapshot);
  const explicitRetry = explicitCooldown(snapshot);

  const combinedText = JSON.stringify({ scheduler: schedulerResult.job, current, runtime: snapshot.runtime || null });
  const quotaLimited = /quota exhausted|usage_limit_reached|provider quota/i.test(combinedText);
  const retryMatch = combinedText.match(/retry after[ ]+(\d+)s/i);
  const retrySeconds = retryMatch ? Number(retryMatch[1]) : null;
  const lastRunDate = parseDate(scheduler?.lastRun);
  const inferredRetry = quotaLimited && retrySeconds && lastRunDate
    ? new Date(lastRunDate.getTime() + retrySeconds * 1000).toISOString()
    : null;
  const retryNotBeforeUtc = explicitRetry || inferredRetry;
  const retryDate = parseDate(retryNotBeforeUtc);
  const cooldownActive = Boolean(retryDate && retryDate.getTime() > Date.now());
  const needsHuman = !humanGateIsClear(current.needs_human);

  let mode = "idle";
  if (!stateResult.connected && !schedulerResult.connected) mode = "offline";
  else if (needsHuman) mode = "human_gate";
  else if (cooldownActive || quotaLimited) mode = "provider_cooldown";
  else if (scheduler?.active) mode = "scheduled";

  return NextResponse.json({
    connected: stateResult.connected || schedulerResult.connected,
    mode,
    currentTask,
    currentFixture,
    lastCompletedWork: current.last_completed_work || null,
    next: current.next || null,
    blockers: current.blockers || null,
    needsHuman: current.needs_human || null,
    provider: {
      name: "openai-codex",
      model: "gpt-5.6-sol",
      state: mode === "provider_cooldown" ? "cooldown" : schedulerResult.connected ? "ready_or_unknown" : "unknown",
      retryNotBeforeUtc,
      retryAfterSeconds: retrySeconds,
      cooldownSource: explicitRetry ? "state_feed" : inferredRetry ? "scheduler_inference" : null,
    },
    scheduler,
    compute,
    telemetry: {
      stateFeed: stateResult.connected,
      scheduler: schedulerResult.connected,
      compute: compute.available,
      exactProviderCooldown: Boolean(explicitRetry),
    },
    safety: record(current.safety),
    messages: [stateResult.message, schedulerResult.message].filter(Boolean),
    generatedAt: new Date().toISOString(),
    readOnly: true,
    modelLaunch: false,
  }, { headers: { "Cache-Control": "no-store" } });
}
