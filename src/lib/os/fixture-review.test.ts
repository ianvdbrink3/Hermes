import { describe, expect, it } from "vitest";
import {
  buildFixtureCards,
  parseFixtureReviewSnapshot,
  selectPresentedFixture,
  type FixtureCardSnapshot,
} from "./fixture-review";

function snapshot(
  fixtureReview: ReturnType<typeof parseFixtureReviewSnapshot>,
  overrides: Partial<FixtureCardSnapshot> = {},
): FixtureCardSnapshot {
  return {
    fixtureReview,
    mission: { fixture: "FS-I24", fixtureNumber: 24 },
    runtime: { state: "READY" },
    sourceSnapshot: {},
    events: [],
    ...overrides,
  };
}

function card(cards: ReturnType<typeof buildFixtureCards>, fixtureId: string) {
  const result = cards.find((item) => item.fixtureId === fixtureId);
  expect(result, `${fixtureId} should be present`).toBeDefined();
  return result!;
}

describe("authoritative fixture review mapping", () => {
  it("renders only a validated semantic PASS as BEWEZEN PASS with positive tone", () => {
    const feed = parseFixtureReviewSnapshot({
      fixture_review: {
        fixtures: [
          { fixture_id: "FS-I23", status: "PASS", semantic_verdict: "PASS" },
        ],
      },
    });

    const result = card(buildFixtureCards(snapshot(feed)), "FS-I23");

    expect(result).toMatchObject({ status: "PASS", label: "BEWEZEN PASS", tone: "positive" });
  });

  it("keeps ACCOUNTED_REVIEWER_FAILED behind WAIT_RETRY_WINDOW out of PASS styling", () => {
    const feed = parseFixtureReviewSnapshot({
      fixture_review: {
        fixtures: [
          {
            fixture_id: "FS-I24",
            status: "WAIT_RETRY_WINDOW",
            blocker_type: "SAME_TASK_RETRY_LIMIT_REACHED",
            same_task_starts_used: 2,
            same_task_starts_limit: 2,
            earliest_retry_at: "2026-09-17T03:12:30.492334+00:00",
            scheduler_active: true,
          },
        ],
      },
    });

    const result = card(buildFixtureCards(snapshot(feed, {
      sourceSnapshot: {
        reviews: [{ fixture: "FS-I24", verdict: "ACCOUNTED_REVIEWER_FAILED" }],
      },
    })), "FS-I24");

    expect(result).toMatchObject({
      status: "WAIT_RETRY_WINDOW",
      label: "WACHT OP RETRYVENSTER",
      tone: "warning",
      sameTaskStartsUsed: 2,
      sameTaskStartsLimit: 2,
      schedulerActive: true,
    });
  });

  it("does not turn batch or packet integrity PASS into fixture PASS", () => {
    const feed = parseFixtureReviewSnapshot({});
    const result = card(buildFixtureCards(snapshot(feed, {
      sourceSnapshot: {
        reviews: [
          { fixture: "FS-I24", verdict: "PASS", result_type: "batch_integrity" },
          { fixture_id: "FS-I24", outcome: "PASS", result_type: "packet_integrity" },
        ],
      },
    })), "FS-I24");

    expect(result.status).not.toBe("PASS");
    expect(result.tone).not.toBe("positive");
  });

  it("does not turn an authority correction PASS mentioning a fixture into fixture PASS", () => {
    const feed = parseFixtureReviewSnapshot({});
    const result = card(buildFixtureCards(snapshot(feed, {
      sourceSnapshot: {
        experiments: {
          recent: [{
            experiment_id: "R9A4-AUTHORITY-CORRECTION",
            verdict: "PASS",
            semantic_verdict: "PASS",
            result: "Authority correction accepted before the FS-I24 retry.",
          }],
        },
      },
    })), "FS-I24");

    expect(result.status).not.toBe("PASS");
    expect(result.tone).not.toBe("positive");
  });

  it("preserves authoritative WAIT_RETRY_WINDOW and NEXT ordering and labels", () => {
    const feed = parseFixtureReviewSnapshot({
      fixture_review: {
        fixtures: [
          { fixture_id: "FS-I25", status: "NEXT" },
          { fixture_id: "FS-I24", status: "WAIT_RETRY_WINDOW" },
        ],
      },
    });

    const cards = buildFixtureCards(snapshot(feed));

    expect(cards.filter((item) => item.number >= 24 && item.number <= 25)).toMatchObject([
      { fixtureId: "FS-I24", label: "WACHT OP RETRYVENSTER", tone: "warning" },
      { fixtureId: "FS-I25", label: "HIERNA", tone: "neutral" },
    ]);
  });

  it("updates directly when the backend moves FS-I24 to PASS and FS-I25 to CURRENT", () => {
    const before = parseFixtureReviewSnapshot({
      fixture_review: { fixtures: [
        { fixture_id: "FS-I24", status: "WAIT_RETRY_WINDOW" },
        { fixture_id: "FS-I25", status: "NEXT" },
      ] },
    });
    const after = parseFixtureReviewSnapshot({
      fixture_review: { fixtures: [
        { fixture_id: "FS-I24", status: "PASS", semantic_verdict: "PASS" },
        { fixture_id: "FS-I25", status: "CURRENT" },
      ] },
    });

    const beforeCards = buildFixtureCards(snapshot(before));
    const afterCards = buildFixtureCards(snapshot(after));

    expect(card(beforeCards, "FS-I24").status).toBe("WAIT_RETRY_WINDOW");
    expect(card(beforeCards, "FS-I25").status).toBe("NEXT");
    expect(card(afterCards, "FS-I24")).toMatchObject({ status: "PASS", tone: "positive" });
    expect(card(afterCards, "FS-I25")).toMatchObject({ status: "CURRENT", label: "REVIEW NODIG", tone: "attention" });
  });

  it("fails closed for missing and malformed feeds without creating a false PASS", () => {
    const legacySignals = {
      sourceSnapshot: {
        reviews: [{ fixture_id: "FS-I24", semantic_verdict: "PASS" }],
      },
    };
    const missing = buildFixtureCards(snapshot(parseFixtureReviewSnapshot({}), legacySignals));
    const malformed = buildFixtureCards(snapshot(parseFixtureReviewSnapshot({
      fixture_review: {
        fixtures: [{ fixture_id: "FS-I24", status: "PASS" }],
      },
    }), legacySignals));

    expect(card(missing, "FS-I24").status).not.toBe("PASS");
    expect(card(malformed, "FS-I24")).toMatchObject({
      status: "NOT_IN_FEED",
      label: "NIET IN FEED",
      tone: "muted",
    });
  });

  it("allows legacy PASS only for an explicit fixture-scoped semantic review contract", () => {
    const cards = buildFixtureCards(snapshot(parseFixtureReviewSnapshot({}), {
      sourceSnapshot: {
        reviews: [{
          fixture_id: "FS-I23",
          review_contract: "semantic-review-v2",
          semantic_verdict: "PASS",
        }],
      },
    }));

    expect(card(cards, "FS-I23")).toMatchObject({
      status: "PASS",
      label: "BEWEZEN PASS",
      tone: "positive",
    });
  });

  it("does not republish legacy mission current when an authoritative feed has no active fixture", () => {
    const validFeed = parseFixtureReviewSnapshot({
      fixture_review: { fixtures: [{ fixture_id: "FS-I24", status: "PASS", semantic_verdict: "PASS" }] },
    });
    const malformedFeed = parseFixtureReviewSnapshot({ fixture_review: { fixtures: "invalid" } });

    expect(selectPresentedFixture(validFeed, buildFixtureCards(snapshot(validFeed)), {
      fixture: "FS-I24",
      fixtureNumber: 24,
      nextFixture: "FS-I25",
    })).toEqual({ fixture: null, fixtureNumber: null, nextFixture: null });
    expect(selectPresentedFixture(malformedFeed, buildFixtureCards(snapshot(malformedFeed)), {
      fixture: "FS-I24",
      fixtureNumber: 24,
      nextFixture: "FS-I25",
    })).toEqual({ fixture: null, fixtureNumber: null, nextFixture: null });
  });

  it("rejects contradictory authoritative feeds with multiple current or next fixtures", () => {
    const multipleCurrent = parseFixtureReviewSnapshot({ fixture_review: { fixtures: [
      { fixture_id: "FS-I24", status: "CURRENT" },
      { fixture_id: "FS-I25", status: "WAIT_PROVIDER" },
    ] } });
    const multipleNext = parseFixtureReviewSnapshot({ fixture_review: { fixtures: [
      { fixture_id: "FS-I25", status: "NEXT" },
      { fixture_id: "FS-I26", status: "NEXT" },
    ] } });

    expect(multipleCurrent.state).toBe("malformed");
    expect(multipleNext.state).toBe("malformed");
  });
});
