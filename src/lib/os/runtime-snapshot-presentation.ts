import type { RepairedRuntimeSnapshot } from "@/lib/os/runtime-snapshot-repair";

type JsonRecord = Record<string, unknown>;

export type PresentedRuntimeSnapshot = RepairedRuntimeSnapshot & {
  presentation: {
    humanGateFutureOnly: boolean;
    fixtureDerivedFromAcceptedPass: boolean;
    rawFixture: string | null;
    rawFixtureNumber: number | null;
    reviewHistoryProjectedFromExperiments: boolean;
  };
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

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

function fixtureFromResearchRecord(value: unknown) {
  const item = record(value);
  const source = [
    item.fixture,
    item.fixture_id,
    item.task_id,
    item.taskId,
    item.case_ref,
    item.experiment_id,
    item.hypothesis,
    item.result,
    item.title,
    item.message,
  ]
    .map(text)
    .join(" ");
  const match = source.match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function passFixtureFromRecord(value: unknown) {
  const item = record(value);
  if (!Object.keys(item).length) return null;

  const outcome = [
    item.verdict,
    item.outcome,
    item.overall,
    item.overall_outcome,
    item.overallOutcome,
    item.response_overall,
    item.responseOverall,
  ]
    .map((entry) => normalized(entry).toUpperCase())
    .find(Boolean);

  if (outcome !== "PASS") return null;
  return fixtureFromResearchRecord(item);
}

function acceptedPassFixture(snapshot: RepairedRuntimeSnapshot) {
  const direct = passFixtureFromRecord(snapshot.lastReview);
  if (direct) return direct;

  const completed = text(snapshot.mission.lastCompletedWork);
  if (!/\bPASS\b/i.test(completed)) return null;
  const match = completed.match(/FS-I(\d+)/i);
  return match ? Number(match[1]) : null;
}

function projectReviewHistory(sourceSnapshot: unknown) {
  const source = record(sourceSnapshot);
  const existingReviews = rows(source.reviews);
  if (existingReviews.length) {
    return { sourceSnapshot: source, projected: false };
  }

  const experiments = record(source.experiments);
  const experimentRows = rows(experiments.recent || experiments.entries);
  if (!experimentRows.length) {
    return { sourceSnapshot: source, projected: false };
  }

  const reviews = experimentRows
    .map((item) => {
      const fixtureNo = fixtureFromResearchRecord(item);
      return fixtureNo ? { ...item, fixture: `FS-I${fixtureNo}` } : item;
    })
    .filter((item) => fixtureFromResearchRecord(item) !== null);

  if (!reviews.length) {
    return { sourceSnapshot: source, projected: false };
  }

  return {
    sourceSnapshot: {
      ...source,
      reviews,
    },
    projected: true,
  };
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

  const reviewProjection = projectReviewHistory(snapshot.sourceSnapshot);

  return {
    ...snapshot,
    sourceSnapshot: reviewProjection.sourceSnapshot,
    runtime,
    mission: {
      ...snapshot.mission,
      fixture: displayedFixtureNumber ? `FS-I${displayedFixtureNumber}` : snapshot.mission.fixture,
      fixtureNumber: displayedFixtureNumber,
      nextFixture: deriveNextFixture && displayedFixtureNumber && displayedFixtureNumber < 30
        ? `FS-I${displayedFixtureNumber + 1}`
        : snapshot.mission.nextFixture,
      // The presented contract describes what is actionable *now*. Keep the
      // original future-approval wording in sourceSnapshot/presentation metadata,
      // but do not expose it as an active current human gate to UI consumers.
      needsHuman: futureOnlyGate ? null : snapshot.mission.needsHuman,
    },
    presentation: {
      humanGateFutureOnly: futureOnlyGate,
      fixtureDerivedFromAcceptedPass: deriveNextFixture,
      rawFixture,
      rawFixtureNumber,
      reviewHistoryProjectedFromExperiments: reviewProjection.projected,
    },
  };
}
