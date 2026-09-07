import { brainHermesFetch, getBrainProfileConfig } from "@/lib/brain/hermes-client";
import { getDeploymentMetadata } from "@/lib/os-version";

type JsonRecord = Record<string, unknown>;

export type RuntimeState =
  | "READY"
  | "RUNNING"
  | "WAITING_PROVIDER"
  | "WAITING_PROVIDER_UNVERIFIED"
  | "WAITING_BUDGET"
  | "WAITING_SPACING"
  | "NEEDS_HUMAN"
  | "BLOCKED_UNVERIFIED_USAGE"
  | "BLOCKED_INTEGRITY"
  | "IDLE"
  | "DEGRADED"
  | "OFFLINE";

type ProviderState = "READY_OR_UNKNOWN" | "COOLDOWN" | "LIMITED_UNVERIFIED" | "UNKNOWN";

export type RuntimeSnapshotV1 = {
  schemaVersion: 1;
  generatedAt: string;
  deployment: ReturnType<typeof getDeploymentMetadata>;
  runtime: {
    state: RuntimeState;
    reason: string | null;
    readOnly: true;
  };
  mission: {
    taskId: string | null;
    fixture: string | null;
    fixtureNumber: number | null;
    nextFixture: string | null;
    objective: unknown;
    inProgress: unknown;
    next: unknown;
    blockers: unknown;
    needsHuman: unknown;
    lastCompletedWork: unknown;
  };
  provider: {
    name: string;
    model: string;
    state: ProviderState;
    retryNotBeforeUtc: string | null;
    cooldownActive: boolean;
    historicalQuotaSignal: boolean;
  };
  scheduler: {
    found: boolean;
    id: string | null;
    name: string | null;
    active: boolean;
    schedule: unknown;
    nextRun: unknown;
    lastRun: unknown;
    lastStatus: unknown;
  };
  compute: {
    available: boolean;
    runs24h: number | null;
    maxRuns24h: number | null;
    promptTokens24h: number | null;
    maxPromptTokens24h: number | null;
    totalTokens24h: number | null;
    maxTotalTokens24h: number | null;
    openReservations: number | null;
    voidedReservations: number | null;
    estimatedContextBytes: number | null;
    maxContextBytes: number | null;
  };
  lastReview: JsonRecord | null;
  events: JsonRecord[];
  safety: JsonRecord;
  connections: {
    research: { configured: boolean; state: string };
    production: { configured: boolean; state: string };
    builder: { configured: boolean; state: string };
  };
  telemetry: {
    stateFeed: boolean;
    scheduler: boolean;
    compute: boolean;
    exactProviderCooldown: boolean;
    runtimeEvents: boolean;
  };
  sourceSnapshot: JsonRecord;
};

const runtimeStates = new Set<RuntimeState>([
  "READY",
  "RUNNING",
  "WAITING_PROVIDER",
  "WAITING_PROVIDER_UNVERIFIED",
  "WAITING_BUDGET",
  "WAITING_SPACING",
  "NEEDS_HUMAN",
  "BLOCKED_UNVERIFIED_USAGE",
  "BLOCKED_INTEGRITY",
  "IDLE",
  "DEGRADED",
  "OFFLINE",
]);

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

function humanGateIsClear(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.!?:;,]+$/g, "")
    .trim();
  return ["", "none", "—", "-", "n/a", "null", "nothing", "geen", "no blockers", "no human gate", "no human gates", "none required"].includes(normalized);
}

function fixtureNumber(value: unknown) {
  const match = String(value ?? "").match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function explicitRuntimeState(snapshot: JsonRecord): RuntimeState | null {
  const runtime = record(snapshot.runtime);
  const raw = pickString(runtime, ["state", "runtime_state", "status"]);
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace(/[ -]+/g, "_") as RuntimeState;
  return runtimeStates.has(normalized) ? normalized : null;
}

function explicitProviderState(snapshot: JsonRecord): ProviderState | null {
  const runtime = record(snapshot.runtime);
  const provider = record(runtime.provider || snapshot.provider);
  const raw = pickString(provider, ["state", "provider_state", "status"])
    || pickString(runtime, ["provider_state", "provider_status"]);
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace(/[ -]+/g, "_");
  if (["COOLDOWN", "WAITING_PROVIDER"].includes(normalized)) return "COOLDOWN";
  if (["LIMITED_UNVERIFIED", "WAITING_PROVIDER_UNVERIFIED", "LIMITED"].includes(normalized)) return "LIMITED_UNVERIFIED";
  if (["READY", "AVAILABLE", "READY_OR_UNKNOWN"].includes(normalized)) return "READY_OR_UNKNOWN";
  if (normalized === "UNKNOWN") return "UNKNOWN";
  return null;
}

function nestedCompute(snapshot: JsonRecord) {
  const runtime = record(snapshot.runtime);
  for (const value of [runtime.compute, runtime.compute_budget, snapshot.compute, snapshot.compute_budget, snapshot.budget]) {
    const candidate = record(value);
    if (Object.keys(candidate).length) return candidate;
  }
  return {};
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

function explicitCooldown(snapshot: JsonRecord) {
  const runtime = record(snapshot.runtime);
  const provider = record(runtime.provider);
  const cooldown = record(runtime.provider_cooldown || snapshot.provider_cooldown || provider.cooldown);
  return pickString(cooldown, ["retry_not_before_utc", "retryNotBeforeUtc", "retry_not_before", "not_before"])
    || pickString(provider, ["retry_not_before_utc", "retryNotBeforeUtc"]);
}

function extractJobs(payload: unknown) {
  if (Array.isArray(payload)) return rows(payload);
  const source = record(payload);
  for (const key of ["jobs", "data", "items"]) {
    if (Array.isArray(source[key])) return rows(source[key]);
  }
  return [];
}

function selectResearchRouter(jobs: JsonRecord[]) {
  return jobs.find((job) => String(job.name || "").trim().toLowerCase() === "research review router") || null;
}

function schedulerView(job: JsonRecord | null) {
  if (!job) {
    return { found: false, id: null, name: null, active: false, schedule: null, nextRun: null, lastRun: null, lastStatus: null };
  }
  const status = String(job.status || job.state || "active").toLowerCase();
  return {
    found: true,
    id: String(job.id || job.job_id || "") || null,
    name: String(job.name || "Research Review Router"),
    active: job.active !== false && job.enabled !== false && status !== "paused" && status !== "disabled",
    schedule: job.schedule || job.schedule_text || null,
    nextRun: job.next_run || job.nextRun || job.next_run_at || null,
    lastRun: job.last_run || job.lastRun || job.last_run_at || null,
    lastStatus: job.last_status || job.lastStatus || null,
  };
}

async function fetchStateFeed() {
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

async function fetchResearchRouter() {
  try {
    const response = await brainHermesFetch("research", "/api/jobs");
    if (!response.ok) return { connected: false, job: null as JsonRecord | null, message: `Research jobs returned HTTP ${response.status}.` };
    return { connected: true, job: selectResearchRouter(extractJobs(await response.json())), message: undefined };
  } catch (error) {
    return { connected: false, job: null as JsonRecord | null, message: error instanceof Error ? error.message : "Research scheduler unavailable." };
  }
}

async function connectionState(environment: "production" | "research" | "builder") {
  const config = getBrainProfileConfig(environment);
  if (!config.configured) return { configured: false, state: "not_configured" };
  try {
    const response = await brainHermesFetch(environment, "/health", { signal: AbortSignal.timeout(5_000) });
    if (response.status === 401 || response.status === 403) return { configured: true, state: "auth_error" };
    return { configured: true, state: response.ok ? "connected" : "degraded" };
  } catch {
    return { configured: true, state: "offline" };
  }
}

function hasUnverifiedUsageEvidence(snapshot: JsonRecord) {
  const current = record(snapshot.current);
  const runtime = record(snapshot.runtime);
  const combined = `${JSON.stringify(current)} ${JSON.stringify(runtime)}`.toLowerCase();
  return /open_usage_missing|native usage missing|usage could not be verified|unverified usage/.test(combined);
}

function hasFailedIntegrityEvidence(snapshot: JsonRecord) {
  const current = record(snapshot.current);
  const runtime = record(snapshot.runtime);
  const combined = `${JSON.stringify(current)} ${JSON.stringify(runtime)}`.toLowerCase();
  return /integrity (?:check|gate|verification)? ?failed|hash mismatch|verification failed|quality gate failed|integrity_error/.test(combined);
}

function determineRuntimeState(
  snapshot: JsonRecord,
  stateConnected: boolean,
  schedulerConnected: boolean,
  scheduler: ReturnType<typeof schedulerView>,
  cooldownActive: boolean,
  providerState: ProviderState | null,
): { state: RuntimeState; reason: string | null } {
  const current = record(snapshot.current);
  const explicit = explicitRuntimeState(snapshot);

  if (!stateConnected && !schedulerConnected) return { state: "OFFLINE", reason: "State feed and scheduler are unavailable." };
  if (hasUnverifiedUsageEvidence(snapshot)) return { state: "BLOCKED_UNVERIFIED_USAGE", reason: "Model usage cannot be verified; automatic retry must remain fail-closed." };
  if (hasFailedIntegrityEvidence(snapshot)) return { state: "BLOCKED_INTEGRITY", reason: "An integrity or verification gate is explicitly failing." };
  if (!humanGateIsClear(current.needs_human)) return { state: "NEEDS_HUMAN", reason: "A human gate is recorded in the authoritative mission state." };
  if (cooldownActive) return { state: "WAITING_PROVIDER", reason: "Provider cooldown is active until the exact retry-not-before timestamp." };
  if (providerState === "LIMITED_UNVERIFIED" || explicit === "WAITING_PROVIDER_UNVERIFIED") {
    return { state: "WAITING_PROVIDER_UNVERIFIED", reason: "The authoritative state reports a provider limit without a usable active cooldown timestamp." };
  }
  if (explicit === "WAITING_PROVIDER") {
    return { state: "DEGRADED", reason: "The state feed says WAITING_PROVIDER but no future exact retry timestamp is active; stale provider-wait state is not trusted." };
  }

  if (explicit && !["OFFLINE", "WAITING_PROVIDER", "WAITING_PROVIDER_UNVERIFIED"].includes(explicit)) {
    return { state: explicit, reason: pickString(record(snapshot.runtime), ["reason", "message"]) };
  }

  const compute = computeView(snapshot);
  if (compute.available && compute.maxRuns24h !== null && compute.runs24h !== null && compute.runs24h >= compute.maxRuns24h) {
    return { state: "WAITING_BUDGET", reason: "The rolling run budget is exhausted." };
  }
  if (!scheduler.found) return { state: "DEGRADED", reason: "Research Review Router was not found. Deprecated scheduler jobs are never used as a fallback." };

  const status = String(scheduler.lastStatus || "").toLowerCase();
  if (/running|started|in_progress/.test(status)) return { state: "RUNNING", reason: null };
  if (scheduler.active) return { state: "READY", reason: null };
  return { state: "IDLE", reason: "Research Review Router is not active." };
}

function eventTimestamp(event: JsonRecord) {
  const value = event.timestamp || event.ts || event.created_at || event.createdAt;
  const parsed = parseDate(value);
  return parsed ? parsed.getTime() : 0;
}

function normalizedEvents(snapshot: JsonRecord) {
  const runtime = record(snapshot.runtime);
  return rows(runtime.events || snapshot.events)
    .slice()
    .sort((left, right) => eventTimestamp(right) - eventTimestamp(left))
    .slice(0, 100);
}

function publicSourceSnapshot(snapshot: JsonRecord) {
  const safe: JsonRecord = {};
  for (const key of ["current", "experiments", "backlog", "decisions", "quality", "git", "reviews"]) {
    if (snapshot[key] !== undefined) safe[key] = snapshot[key];
  }
  const runtime = record(snapshot.runtime);
  if (runtime.reviews !== undefined) safe.runtime = { reviews: runtime.reviews };
  return safe;
}

export async function getRuntimeSnapshot(): Promise<RuntimeSnapshotV1> {
  const [stateResult, schedulerResult, productionConnection, researchConnection, builderConnection] = await Promise.all([
    fetchStateFeed(),
    fetchResearchRouter(),
    connectionState("production"),
    connectionState("research"),
    connectionState("builder"),
  ]);

  const snapshot = stateResult.snapshot;
  const current = record(snapshot.current);
  const runtimeRecord = record(snapshot.runtime);
  const scheduler = schedulerView(schedulerResult.job);
  const taskId = pickString(current, ["current_task", "task_id", "task"]);
  const fixtureNo = fixtureNumber(taskId || current.current_objective || current.in_progress);
  const explicitNext = pickString(runtimeRecord, ["next_fixture", "nextFixture"])
    || pickString(current, ["next_fixture", "nextFixture"])
    || (fixtureNumber(current.next) ? `FS-I${fixtureNumber(current.next)}` : null);

  const retryNotBeforeUtc = explicitCooldown(snapshot);
  const retryDate = parseDate(retryNotBeforeUtc);
  const cooldownActive = Boolean(retryDate && retryDate.getTime() > Date.now());
  const combined = JSON.stringify({ current, runtime: snapshot.runtime || null, scheduler: schedulerResult.job });
  const historicalQuotaSignal = /quota exhausted|usage_limit_reached|provider quota/i.test(combined);
  const providerExplicit = explicitProviderState(snapshot);
  const state = determineRuntimeState(snapshot, stateResult.connected, schedulerResult.connected, scheduler, cooldownActive, providerExplicit);
  const compute = computeView(snapshot);
  const events = normalizedEvents(snapshot);
  const lastReviewCandidate = record(runtimeRecord.last_review || snapshot.last_review);

  const providerState: ProviderState = cooldownActive
    ? "COOLDOWN"
    : providerExplicit === "LIMITED_UNVERIFIED"
      ? "LIMITED_UNVERIFIED"
      : providerExplicit === "UNKNOWN"
        ? "UNKNOWN"
        : schedulerResult.connected
          ? "READY_OR_UNKNOWN"
          : "UNKNOWN";

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    deployment: getDeploymentMetadata(),
    runtime: { state: state.state, reason: state.reason, readOnly: true },
    mission: {
      taskId,
      fixture: fixtureNo ? `FS-I${fixtureNo}` : null,
      fixtureNumber: fixtureNo,
      nextFixture: explicitNext,
      objective: current.current_objective || null,
      inProgress: current.in_progress || null,
      next: current.next || null,
      blockers: current.blockers || null,
      needsHuman: current.needs_human || null,
      lastCompletedWork: current.last_completed_work || null,
    },
    provider: {
      name: "openai-codex",
      model: "gpt-5.6-sol",
      state: providerState,
      retryNotBeforeUtc,
      cooldownActive,
      historicalQuotaSignal,
    },
    scheduler,
    compute,
    lastReview: Object.keys(lastReviewCandidate).length ? lastReviewCandidate : null,
    events,
    safety: record(current.safety || snapshot.safety),
    connections: {
      research: researchConnection,
      production: productionConnection,
      builder: builderConnection,
    },
    telemetry: {
      stateFeed: stateResult.connected,
      scheduler: schedulerResult.connected,
      compute: compute.available,
      exactProviderCooldown: Boolean(retryDate),
      runtimeEvents: events.length > 0,
    },
    sourceSnapshot: publicSourceSnapshot(snapshot),
  };
}

export function manualModelInvocationPolicy(snapshot: RuntimeSnapshotV1) {
  if (!snapshot.telemetry.stateFeed) {
    return {
      allowed: false,
      code: "STATE_FEED_REQUIRED",
      reason: "Manual model invocation is fail-closed because the authoritative state feed is unavailable.",
    };
  }

  const hardBlocked: RuntimeState[] = [
    "WAITING_PROVIDER",
    "WAITING_PROVIDER_UNVERIFIED",
    "BLOCKED_UNVERIFIED_USAGE",
    "BLOCKED_INTEGRITY",
    "OFFLINE",
  ];
  if (hardBlocked.includes(snapshot.runtime.state)) {
    return { allowed: false, code: snapshot.runtime.state, reason: snapshot.runtime.reason || "Runtime policy blocks model invocation." };
  }

  if (snapshot.provider.state === "UNKNOWN") {
    return {
      allowed: false,
      code: "PROVIDER_STATE_UNKNOWN",
      reason: "Manual model invocation is blocked because provider state cannot be verified.",
    };
  }

  const compute = snapshot.compute;
  const allowTelemetryGap = process.env.HERMES_ALLOW_MANUAL_MODEL_TELEMETRY_GAP === "true";
  if (!compute.available && !allowTelemetryGap) {
    return {
      allowed: false,
      code: "COMPUTE_TELEMETRY_REQUIRED",
      reason: "Manual model invocation is blocked until rolling compute usage is published by the VPS state feed.",
    };
  }

  if (compute.available) {
    const requiredCounters = [
      compute.runs24h,
      compute.maxRuns24h,
      compute.promptTokens24h,
      compute.maxPromptTokens24h,
      compute.totalTokens24h,
      compute.maxTotalTokens24h,
    ];
    if (requiredCounters.some((value) => value === null)) {
      return {
        allowed: false,
        code: "COMPUTE_TELEMETRY_INCOMPLETE",
        reason: "Manual model invocation is blocked because rolling run/prompt/total token counters are incomplete.",
      };
    }
    if ((compute.runs24h as number) >= (compute.maxRuns24h as number)) {
      return { allowed: false, code: "WAITING_BUDGET", reason: "Rolling run budget is exhausted." };
    }
    if ((compute.promptTokens24h as number) >= (compute.maxPromptTokens24h as number)) {
      return { allowed: false, code: "WAITING_BUDGET", reason: "Rolling prompt-token budget is exhausted." };
    }
    if ((compute.totalTokens24h as number) >= (compute.maxTotalTokens24h as number)) {
      return { allowed: false, code: "WAITING_BUDGET", reason: "Rolling total-token budget is exhausted." };
    }
  }

  return {
    allowed: true,
    code: compute.available ? "ALLOW_WITH_TELEMETRY_NONATOMIC" : "ALLOW_EXPLICIT_TELEMETRY_GAP",
    reason: compute.available
      ? "Provider and rolling limits allow a manual research run. VPS-side atomic reservation accounting is still a documented gap."
      : "An explicit environment override allows this manual run despite missing compute telemetry; atomic accounting is not available.",
  };
}
