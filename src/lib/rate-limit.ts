type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: next.resetAt };
  }

  current.count += 1;
  buckets.set(key, current);

  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return {
    allowed: current.count <= limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

// This is intentionally a best-effort in-memory limiter. On Vercel, each warm
// isolate maintains its own bucket map. Replace this with a shared durable store
// before exposing high-value execution endpoints to broad traffic.
