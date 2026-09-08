import type { RepairedRuntimeSnapshot } from "@/lib/os/runtime-snapshot-repair";

type JsonRecord = Record<string, unknown>;

export type PresentedRuntimeSnapshot = RepairedRuntimeSnapshot & {
  presentation: {
    humanGateFutureOnly: boolean;
    fixtureDerivedFromAcceptedPass: boolean;
    rawFixture: string | null;
    rawFixtureNumber: number | null;
  };
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function currentGateIsExplicitlyFutureOnly(value: unknown) {
  const source = normalized(value);
  if (!source) return false;

  return (
    /^none for current\b/.test(source) ||
    /^no human (?:action|approval|decision|gate) (?:is )?required for current\b/.test(source) ||
    /^no (?:action|approval) (?:is )?required for current\b/.test(source) ||
    /^geen (?:menselijke )?(?:actie|goedkeuring|beslissing) nodig voor huidig/.test(source)
  ) && /\b(?:future|later|toekomst|paper|live|provider|broker|risk mandate)\b/.test(source);
}

function computeBudgetExhausted(snapshot: RepairedRuntimeSnapshot) {
  const compute = snapshot.compute;
  return (
    (compute.runs24h !== null && compute.maxRuns24h !== null && compute.runs24h >= compute.maxRuns24h) ||
    (compute.promptTokens24h !== null && compute.maxPromptTokens24h !== null && compute.promptTokens24h >= compute.maxPromptTokens24h) ||
    (compute.totalTokens24h !== null && compute.maxTotalTokens24h !== null && compute.totalTokens24h >= compute.maxTotalTokens24h)
  );
}

function passFixtureFromRecord(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
  if (!Object.keys(record).length) return null;

  const outcome = [
    record.verdict,
    record.outcome,
    record.overall,
    record.overall_outcome,
    record.overallOutcome,
    record.response_overall,
    record.responseOverall,
  ]
    .map((item) => normalized(item).toUpperCase())
    .find(Boolean);

  if (outcome !== "PASS") return null;

  const source = `${text(record.fixture)} ${text(record.task_id)} ${text(record.taskId)} ${text(record.case_ref)}`;
  const match = source.match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function acceptedPassFixture(snapshot: RepairedRuntimeSnapshot) {
  const direct = passFixtureFromRecord(snapshot.lastReview);
  if (direct) return direct;

  const completed = text(snapshot.mission.lastCompletedWork);
  if (!/\bPASS\b/i.test(completed)) return null;
  const match = completed.match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function presentRuntimeSnapshot(snapshot: RepairedRuntimeSnapshot): PresentedRuntimeSnapshot {
  const rawFixture = snapshot.mission.fixture;
  const rawFixtureNumber = snapshot.mission.fixtureNumber;
  const futureOnlyGate = currentGateIsExplicitlyFutureOnly(snapshot.mission.needsHuman);

  let runtime = snapshot.runtime;
  if (snapshot.runtime.state === "NEEDS_HUMAN" && futureOnlyGate) {
    if (snapshot.provider.cooldownActive) {
      runtime = {
        ...runtime,
        state: "WAITING_PROVIDER",
        reason: "No current human action is required; the verified provider cooldown is the active wait condition.",
      };
    } else if (snapshot.provider.state === "LIMITED_UNVERIFIED") {
      runtime = {
        ...runtime,
        state: "WAITING_PROVIDER_UNVERIFIED",
        reason: "No current human action is required; provider availability remains unverified.",
      };
    } else if (computeBudgetExhausted(snapshot)) {
      runtime = {
        ...runtime,
        state: "WAITING_BUDGET",
        reason: "No current human action is required; the rolling compute budget is the active wait condition.",
      };
    } else if (snapshot.scheduler.found && snapshot.scheduler.active) {
      runtime = {
        ...runtime,
        state: "READY",
        reason: "No current human action is required. Future paper/live/provider approvals are safety boundaries, not an active gate.",
      };
    } else if (snapshot.scheduler.found) {
      runtime = {
        ...runtime,
        state: "IDLE",
        reason: "No current human action is required, but the Research Review Router is not active.",
      };
    } else {
      runtime = {
        ...runtime,
        state: "DEGRADED",
        reason: "No current human action is required, but scheduler state is not fully available.",
      };
    }
  }

  const passFixture = acceptedPassFixture(snapshot);
  const deriveNextFixture = Boolean(
    snapshot.scheduler.found &&
    snapshot.scheduler.active &&
    rawFixtureNumber !== null &&
    passFixture === rawFixtureNumber &&
    rawFixtureNumber >= 11 &&
    rawFixtureNumber < 30,
  );

  const displayedFixtureNumber = deriveNextFixture && rawFixtureNumber !== null
    ? rawFixtureNumber + 1
    : rawFixtureNumber;

  return {
    ...snapshot,
    runtime,
    mission: {
      ...snapshot.mission,
      fixture: displayedFixtureNumber ? `FS-I${displayedFixtureNumber}` : snapshot.mission.fixture,
      fixtureNumber: displayedFixtureNumber,
      nextFixture: deriveNextFixture && displayedFixtureNumber && displayedFixtureNumber < 30
        ? `FS-I${displayedFixtureNumber + 1}`
        : snapshot.mission.nextFixture,
    },
    presentation: {
      humanGateFutureOnly: futureOnlyGate,
      fixtureDerivedFromAcceptedPass: deriveNextFixture,
      rawFixture,
      rawFixtureNumber,
    },
  };
}
