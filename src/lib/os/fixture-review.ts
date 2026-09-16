export type FixtureReviewStatus =
  | "PASS"
  | "WAIT_RETRY_WINDOW"
  | "WAIT_SPACING"
  | "WAIT_PROVIDER"
  | "CURRENT"
  | "INCONCLUSIVE"
  | "REJECT"
  | "NEXT"
  | "PENDING"
  | "NOT_IN_FEED";

export type FixtureReviewTone = "positive" | "warning" | "attention" | "negative" | "neutral" | "muted";
export type FixtureFeedState = "valid" | "missing" | "malformed";
export type SemanticVerdict = "PASS" | "INCONCLUSIVE" | "REJECT" | null;

type RecordLike = Record<string, unknown>;

export type FixtureReviewItem = {
  fixtureId: string;
  number: number;
  status: FixtureReviewStatus;
  label: string;
  tone: FixtureReviewTone;
  semanticVerdict: SemanticVerdict;
  blockerType: string | null;
  sameTaskStartsUsed: number | null;
  sameTaskStartsLimit: number | null;
  earliestRetryAt: string | null;
  schedulerActive: boolean | null;
};

export type FixtureReviewFeed = {
  state: FixtureFeedState;
  fixtures: FixtureReviewItem[];
};

export type FixtureCardSnapshot = {
  fixtureReview?: FixtureReviewFeed;
  mission?: { fixture?: string | null; fixtureNumber?: number | null };
  runtime?: { state?: string };
  sourceSnapshot?: RecordLike;
  events?: RecordLike[];
};

const FIRST_FIXTURE = 11;
const LAST_FIXTURE = 30;

const STATUSES = new Set<FixtureReviewStatus>([
  "PASS",
  "WAIT_RETRY_WINDOW",
  "WAIT_SPACING",
  "WAIT_PROVIDER",
  "CURRENT",
  "INCONCLUSIVE",
  "REJECT",
  "NEXT",
  "PENDING",
  "NOT_IN_FEED",
]);
const ACTIVE_STATUSES = new Set<FixtureReviewStatus>([
  "WAIT_RETRY_WINDOW",
  "WAIT_SPACING",
  "WAIT_PROVIDER",
  "CURRENT",
  "INCONCLUSIVE",
  "REJECT",
]);

const STATUS_PRESENTATION: Record<FixtureReviewStatus, { label: string; tone: FixtureReviewTone }> = {
  PASS: { label: "BEWEZEN PASS", tone: "positive" },
  WAIT_RETRY_WINDOW: { label: "WACHT OP RETRYVENSTER", tone: "warning" },
  WAIT_SPACING: { label: "WACHT OP TUSSENRUIMTE", tone: "warning" },
  WAIT_PROVIDER: { label: "WACHT OP PROVIDER", tone: "warning" },
  CURRENT: { label: "REVIEW NODIG", tone: "attention" },
  INCONCLUSIVE: { label: "INCONCLUSIVE", tone: "warning" },
  REJECT: { label: "REJECT", tone: "negative" },
  NEXT: { label: "HIERNA", tone: "neutral" },
  PENDING: { label: "PENDING", tone: "neutral" },
  NOT_IN_FEED: { label: "NIET IN FEED", tone: "muted" },
};

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : {};
}

function fixtureNumber(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^FS-I(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function semanticVerdict(value: unknown): SemanticVerdict {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "PASS" || normalized === "INCONCLUSIVE" || normalized === "REJECT"
    ? normalized
    : null;
}

function itemForStatus(number: number, status: FixtureReviewStatus, fields: Partial<FixtureReviewItem> = {}): FixtureReviewItem {
  const presentation = STATUS_PRESENTATION[status];
  return {
    fixtureId: `FS-I${number}`,
    number,
    status,
    label: presentation.label,
    tone: presentation.tone,
    semanticVerdict: null,
    blockerType: null,
    sameTaskStartsUsed: null,
    sameTaskStartsLimit: null,
    earliestRetryAt: null,
    schedulerActive: null,
    ...fields,
  };
}

function parseFixture(value: unknown): FixtureReviewItem | null {
  const source = record(value);
  const number = fixtureNumber(source.fixture_id);
  const rawStatus = typeof source.status === "string" ? source.status.trim().toUpperCase() : "";
  if (!number || !STATUSES.has(rawStatus as FixtureReviewStatus)) return null;

  const status = rawStatus as FixtureReviewStatus;
  const verdict = semanticVerdict(source.semantic_verdict);
  if (
    (status === "PASS" && verdict !== "PASS") ||
    (status === "INCONCLUSIVE" && verdict !== "INCONCLUSIVE") ||
    (status === "REJECT" && verdict !== "REJECT")
  ) {
    return null;
  }

  const retry = optionalString(source.earliest_retry_at);
  return itemForStatus(number, status, {
    semanticVerdict: verdict,
    blockerType: optionalString(source.blocker_type),
    sameTaskStartsUsed: optionalCount(source.same_task_starts_used),
    sameTaskStartsLimit: optionalCount(source.same_task_starts_limit),
    earliestRetryAt: retry && !Number.isNaN(new Date(retry).getTime()) ? retry : null,
    schedulerActive: optionalBoolean(source.scheduler_active),
  });
}

export function parseFixtureReviewSnapshot(snapshot: unknown): FixtureReviewFeed {
  const source = record(snapshot);
  if (!Object.prototype.hasOwnProperty.call(source, "fixture_review")) {
    return { state: "missing", fixtures: [] };
  }

  const review = record(source.fixture_review);
  if (!Array.isArray(review.fixtures)) return { state: "malformed", fixtures: [] };

  const parsed = review.fixtures.map(parseFixture);
  if (parsed.some((item) => item === null)) return { state: "malformed", fixtures: [] };

  const fixtures = parsed as FixtureReviewItem[];
  if (new Set(fixtures.map((item) => item.fixtureId)).size !== fixtures.length) {
    return { state: "malformed", fixtures: [] };
  }
  if (
    fixtures.filter((item) => ACTIVE_STATUSES.has(item.status)).length > 1 ||
    fixtures.filter((item) => item.status === "NEXT").length > 1
  ) {
    return { state: "malformed", fixtures: [] };
  }

  return { state: "valid", fixtures: fixtures.sort((left, right) => left.number - right.number) };
}

function explicitLegacyFixture(item: RecordLike) {
  return fixtureNumber(item.fixture_id) ?? fixtureNumber(item.fixture);
}

function legacySemanticPasses(snapshot: FixtureCardSnapshot) {
  const source = record(snapshot.sourceSnapshot);
  const runtime = record(source.runtime);
  const experiments = record(source.experiments);
  const candidates = [
    ...(Array.isArray(source.reviews) ? source.reviews : []),
    ...(Array.isArray(runtime.reviews) ? runtime.reviews : []),
    ...(Array.isArray(experiments.recent) ? experiments.recent : []),
    ...(Array.isArray(experiments.entries) ? experiments.entries : []),
    ...(snapshot.events || []),
  ];
  const passes = new Set<number>();

  for (const value of candidates) {
    const item = record(value);
    const number = explicitLegacyFixture(item);
    const contract = typeof item.review_contract === "string" ? item.review_contract.trim().toLowerCase() : "";
    const scope = [item.result_type, item.review_type, item.scope, item.kind]
      .filter((entry): entry is string => typeof entry === "string")
      .join(" ")
      .toLowerCase();
    if (
      number &&
      /^semantic-review-v\d+$/.test(contract) &&
      semanticVerdict(item.semantic_verdict ?? item.semantic_outcome ?? item.semanticOutcome) === "PASS" &&
      !/authority|batch|packet|integrity/.test(scope)
    ) {
      passes.add(number);
    }
  }

  return passes;
}

function legacyStatus(snapshot: FixtureCardSnapshot, number: number, current: number | null, passes: Set<number>) {
  if (passes.has(number)) return "PASS" as const;
  if (!current) return "NOT_IN_FEED" as const;
  if (number < current) return "NOT_IN_FEED" as const;
  if (number > current + 1) return "PENDING" as const;
  if (number === current + 1) return "NEXT" as const;

  const runtime = snapshot.runtime?.state;
  if (runtime === "WAITING_SPACING") return "WAIT_SPACING" as const;
  if (runtime === "WAITING_PROVIDER" || runtime === "WAITING_PROVIDER_UNVERIFIED") return "WAIT_PROVIDER" as const;
  return "CURRENT" as const;
}

export function buildFixtureCards(snapshot: FixtureCardSnapshot): FixtureReviewItem[] {
  const feed = snapshot.fixtureReview ?? { state: "missing", fixtures: [] };
  const authoritative = new Map(feed.fixtures.map((item) => [item.number, item]));
  const current = snapshot.mission?.fixtureNumber ?? fixtureNumber(snapshot.mission?.fixture) ?? null;
  const legacyPasses = feed.state === "missing" ? legacySemanticPasses(snapshot) : new Set<number>();

  return Array.from({ length: LAST_FIXTURE - FIRST_FIXTURE + 1 }, (_, index) => {
    const number = FIRST_FIXTURE + index;
    if (feed.state === "valid") return authoritative.get(number) ?? itemForStatus(number, "NOT_IN_FEED");
    if (feed.state === "malformed") return itemForStatus(number, "NOT_IN_FEED");
    return itemForStatus(number, legacyStatus(snapshot, number, current, legacyPasses), {
      semanticVerdict: legacyPasses.has(number) ? "PASS" : null,
    });
  });
}

export function activeFixture(cards: FixtureReviewItem[]) {
  return cards.find((item) => ACTIVE_STATUSES.has(item.status)) ?? null;
}

export function nextFixture(cards: FixtureReviewItem[]) {
  return cards.find((item) => item.status === "NEXT") ?? null;
}

export function latestPassedFixture(cards: FixtureReviewItem[]) {
  return cards.filter((item) => item.status === "PASS").at(-1) ?? null;
}

export function selectPresentedFixture(
  feed: FixtureReviewFeed,
  cards: FixtureReviewItem[],
  legacy: { fixture: string | null; fixtureNumber: number | null; nextFixture: string | null },
) {
  if (feed.state === "missing") return legacy;
  if (feed.state === "malformed") return { fixture: null, fixtureNumber: null, nextFixture: null };

  const current = activeFixture(cards);
  const next = nextFixture(cards);
  return {
    fixture: current?.fixtureId ?? null,
    fixtureNumber: current?.number ?? null,
    nextFixture: next?.fixtureId ?? null,
  };
}
