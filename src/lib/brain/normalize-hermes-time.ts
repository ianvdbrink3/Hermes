const TIMESTAMP_KEYS = new Set([
  "created_at",
  "updated_at",
  "started_at",
  "ended_at",
  "completed_at",
  "timestamp",
]);

function normalizeTimestampValue(value: unknown): unknown {
  let numeric: number | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    numeric = value;
  } else if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    numeric = Number(value);
  }

  if (numeric === null) return value;

  // Hermes currently reports Unix timestamps in seconds. JavaScript Date expects
  // milliseconds, which otherwise renders current 2026 dates as January 1970.
  const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function normalizeHermesTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeHermesTimestamps);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      TIMESTAMP_KEYS.has(key) ? normalizeTimestampValue(child) : normalizeHermesTimestamps(child),
    ]),
  );
}
