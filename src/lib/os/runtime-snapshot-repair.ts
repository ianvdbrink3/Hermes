import type { RuntimeSnapshotV1, RuntimeState } from "@/lib/os/runtime-snapshot";

type JsonRecord = Record<string, unknown>;

type HumanGateRequirement = true | false | null;

type RepairMetadata = {
  fixtureSource: string | null;
  humanGate: "required" | "clear" | "unverified";
  stateRepaired: boolean;
};

export type RepairedRuntimeSnapshot = RuntimeSnapshotV1 & {
  repair: RepairMetadata;
};

const HARD_STATES = new Set<RuntimeState>([
  "BLOCKED_UNVERIFIED_USAGE",
  "BLOCKED_INTEGRITY",
  "OFFLINE",
]);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstValue(source: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function firstString(source: JsonRecord, keys: string[]) {
  const value = firstValue(source, keys);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function searchable(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fixtureNumber(value: unknown) {
  const match = searchable(value).match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function pickFixture(candidates: Array<{ source: string; value: unknown }>) {
  for (const candidate of candidates) {
    const number = fixtureNumber(candidate.value);
    if (number) return { number, source: candidate.source };
  }
  return { number: null, source: null };
}

function normalizedGateText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?:;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanGateRequirement(value: unknown): HumanGateRequirement {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  if (typeof value === "string") {
    const normalized = normalizedGateText(value);

    if (
      [
        "",
        "none",
        "—",
        "-",
        "n/a",
        "null",
        "nothing",
        "geen",
        "false",
        "no",
        "clear",
        "not required",
        "none required",
        "no blockers",
        "no human gate",
        "no human gates",
        "no human action required",
        "no human action needed",
        "no action required",
        "no owner action required",
        "geen menselijke actie nodig",
        "geen menselijke beslissing nodig",
        "geen actie nodig",
      ].includes(normalized)
    ) {
      return false;
    }

    // A mission can explicitly say that there is no action for the current
    // repository-local phase while documenting approvals that will be needed
    // later (paper/live/provider/broker/risk). Those future boundaries are not
    // an active human gate and must not turn the current runtime red.
    if (
      /^(?:none|nothing) for current\b/.test(normalized) ||
      /^no current (?:human |owner )?(?:action|approval|decision|gate)\b/.test(normalized) ||
      /^geen huidige (?:menselijke )?(?:actie|goedkeuring|beslissing)\b/.test(normalized)
    ) {
      return false;
    }

    if (
      /^(?:no|geen)\b.*\b(?:human|mens|owner|action|actie|gate|approval|goedkeuring|decision|beslissing|required|nodig)\b/.test(
        normalized,
      ) || /\b(?:not required|none required|no action needed)\b/.test(normalized)
    ) {
      return false;
    }

    if (
      /\b(?:human action required|human decision required|owner action required|manual approval required|approval required|menselijke actie nodig|menselijke beslissing nodig|goedkeuring nodig)\b/.test(
        normalized,
      )
    ) {
      return true;
    }

    return null;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    const results = value.map(humanGateRequirement);
    if (results.includes(true)) return true;
    if (results.every((result) => result === false)) return false;
    return null;
  }

  const source = record(value);
  if (!Object.keys(source).length) return false;

  for (const key of [
    "required",
    "needs_human",
    "needsHuman",
    "human_required",
    "humanRequired",
    "active",
    "blocked",
  ]) {
    if (source[key] !== undefined) {
      const result = humanGateRequirement(source[key]);
      if (result !== null) return result;
    }
  }

  for (const key of ["state", "status", "message", "reason", "action"]) {
    if (source[key] !== undefined) {
      const result = humanGateRequirement(source[key]);
      if (result !== null) return result;
    }
  }

  return null;
}

function computeBudgetExhausted(snapshot: RuntimeSnapshotV1) {
  const compute = snapshot.compute;
  return (
    (compute.runs24h !== null &&
      compute.maxRuns24h !== null &&
      compute.runs24h >= compute.maxRuns24h) ||
    (compute.promptTokens24h !== null &&
      compute.maxPromptTokens24h !== null &&
      compute.promptTokens24h >= compute.maxPromptTokens24h) ||
    (compute.totalTokens24h !== null &&
      compute.maxTotalTokens24h !== null &&
      compute.totalTokens24h >= compute.maxTotalTokens24h)
  );
}

function spacingSignal(snapshot: RuntimeSnapshotV1, current: JsonRecord) {
  const combined = [
    snapshot.runtime.reason,
    snapshot.mission.blockers,
    snapshot.mission.next,
    current.blockers,
    current.blocker,
    current.wait_reason,
    current.waitReason,
    current.next,
    current.status,
  ]
    .map(searchable)
    .join(" ")
    .toLowerCase();

  return /minimum[_ -]deep[_ -]run[_ -]spacing|minimum run spacing|minimale tussenruimte|spacing[_ -]active/.test(
    combined,
  );
}

function repairedState(
  snapshot: RuntimeSnapshotV1,
  current: JsonRecord,
  gate: HumanGateRequirement,
): { state: RuntimeState; reason: string | null; repaired: boolean } {
  const original = snapshot.runtime.state;

  if (HARD_STATES.has(original)) {
    return { state: original, reason: snapshot.runtime.reason, repaired: false };
  }

  if (snapshot.provider.cooldownActive) {
    return {
      state: "WAITING_PROVIDER",
      reason: "Provider cooldown is active until the verified retry-not-before timestamp.",
      repaired: original !== "WAITING_PROVIDER",
    };
  }

  if (snapshot.provider.state === "LIMITED_UNVERIFIED") {
    return {
      state: "WAITING_PROVIDER_UNVERIFIED",
      reason: "The provider is limited but no active verified cooldown timestamp is available.",
      repaired: original !== "WAITING_PROVIDER_UNVERIFIED",
    };
  }

  if (gate === true) {
    return {
      state: "NEEDS_HUMAN",
      reason: snapshot.runtime.reason || "A verified human gate is active in mission state.",
      repaired: original !== "NEEDS_HUMAN",
    };
  }

  if (spacingSignal(snapshot, current)) {
    return {
      state: "WAITING_SPACING",
      reason: "Research Review Router is waiting for the minimum deep-run spacing window; no human action is required.",
      repaired: original !== "WAITING_SPACING",
    };
  }

  if (computeBudgetExhausted(snapshot)) {
    return {
      state: "WAITING_BUDGET",
      reason: "The rolling model-run or token budget is exhausted.",
      repaired: original !== "WAITING_BUDGET",
    };
  }

  if (original === "NEEDS_HUMAN" && gate === false) {
    if (snapshot.scheduler.found && snapshot.scheduler.active) {
      return {
        state: "READY",
        reason: "Research Review Router is active and mission state does not require human action.",
        repaired: true,
      };
    }

    if (snapshot.scheduler.found) {
      return {
        state: "IDLE",
        reason: "No human gate is required, but the Research Review Router is not active.",
        repaired: true,
      };
    }

    return {
      state: "DEGRADED",
      reason: "No human gate is required, but scheduler state cannot be verified.",
      repaired: true,
    };
  }

  return { state: original, reason: snapshot.runtime.reason, repaired: false };
}

export function repairRuntimeSnapshot(snapshot: RuntimeSnapshotV1): RepairedRuntimeSnapshot {
  const source = record(snapshot.sourceSnapshot);
  const current = record(source.current);

  const taskId =
    snapshot.mission.taskId ||
    firstString(current, ["current_task", "currentTask", "task_id", "taskId", "task"]);

  const fixture = pickFixture([
    { source: "mission.fixture", value: snapshot.mission.fixture },
    { source: "mission.taskId", value: taskId },
    {
      source: "source.current.current_fixture",
      value: firstValue(current, ["current_fixture", "currentFixture", "fixture"]),
    },
    {
      source: "source.current.current_task",
      value: firstValue(current, ["current_task", "currentTask", "task_id", "taskId", "task"]),
    },
    {
      source: "mission.objective",
      value: snapshot.mission.objective || firstValue(current, ["current_objective", "currentObjective", "objective"]),
    },
    {
      source: "mission.inProgress",
      value: snapshot.mission.inProgress || firstValue(current, ["in_progress", "inProgress"]),
    },
    {
      source: "mission.next",
      value: snapshot.mission.next || firstValue(current, ["next", "next_action", "nextAction"]),
    },
  ]);

  const explicitNext = pickFixture([
    { source: "mission.nextFixture", value: snapshot.mission.nextFixture },
    {
      source: "source.current.next_fixture",
      value: firstValue(current, ["next_fixture", "nextFixture"]),
    },
    {
      source: "source.current.next",
      value: firstValue(current, ["next", "next_action", "nextAction"]),
    },
  ]);

  const rawNeedsHuman =
    snapshot.mission.needsHuman ??
    firstValue(current, ["needs_human", "needsHuman", "human_gate", "humanGate", "human_required", "humanRequired"]);
  const gate = humanGateRequirement(rawNeedsHuman);
  const runtime = repairedState(snapshot, current, gate);

  const fixtureNo = snapshot.mission.fixtureNumber || fixture.number;
  const nextNo = explicitNext.number && explicitNext.number !== fixtureNo ? explicitNext.number : null;

  return {
    ...snapshot,
    runtime: {
      ...snapshot.runtime,
      state: runtime.state,
      reason: runtime.reason,
    },
    mission: {
      ...snapshot.mission,
      taskId,
      fixture: fixtureNo ? `FS-I${fixtureNo}` : null,
      fixtureNumber: fixtureNo,
      nextFixture: nextNo ? `FS-I${nextNo}` : snapshot.mission.nextFixture,
      objective:
        snapshot.mission.objective ??
        firstValue(current, ["current_objective", "currentObjective", "objective"]) ??
        null,
      inProgress:
        snapshot.mission.inProgress ?? firstValue(current, ["in_progress", "inProgress"]) ?? null,
      next:
        snapshot.mission.next ?? firstValue(current, ["next", "next_action", "nextAction"]) ?? null,
      blockers:
        snapshot.mission.blockers ?? firstValue(current, ["blockers", "blocker"]) ?? null,
      needsHuman: rawNeedsHuman ?? null,
      lastCompletedWork:
        snapshot.mission.lastCompletedWork ??
        firstValue(current, ["last_completed_work", "lastCompletedWork"]) ??
        null,
    },
    repair: {
      fixtureSource: fixture.source,
      humanGate: gate === true ? "required" : gate === false ? "clear" : "unverified",
      stateRepaired: runtime.repaired,
    },
  };
}

export function guardManualInvocation(
  snapshot: RepairedRuntimeSnapshot,
  basePolicy: { allowed: boolean; code: string; reason: string },
) {
  if (!basePolicy.allowed) return basePolicy;

  const additionalBlocks = new Set<RuntimeState>([
    "WAITING_BUDGET",
    "WAITING_SPACING",
    "NEEDS_HUMAN",
    "IDLE",
    "DEGRADED",
  ]);

  if (additionalBlocks.has(snapshot.runtime.state)) {
    return {
      allowed: false,
      code: snapshot.runtime.state,
      reason:
        snapshot.runtime.reason ||
        "Manual model invocation is blocked until the autonomous runtime is ready.",
    };
  }

  return basePolicy;
}
