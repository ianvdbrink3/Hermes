# Runtime Snapshot v1 — VPS contract

The browser must not infer research truth from stale text. The authoritative VPS state feed should add the following keys to the existing autonomy snapshot. The OS already consumes these fields when they are present.

```json
{
  "runtime": {
    "provider_cooldown": {
      "provider": "openai-codex",
      "model": "gpt-5.6-sol",
      "retry_not_before_utc": "2026-09-07T02:30:06+00:00"
    },
    "compute": {
      "runs_24h": 0,
      "max_runs_24h": 6,
      "prompt_tokens_24h": 0,
      "max_prompt_tokens_24h": 600000,
      "total_tokens_24h": 0,
      "max_total_tokens_24h": 700000,
      "open_reservations": 0,
      "voided_reservations": 1,
      "estimated_context_bytes": 35183,
      "max_context_bytes": 80000
    },
    "last_review": {
      "fixture": "FS-I12",
      "verdict": "PASS",
      "input_tokens": 8309,
      "output_tokens": 961,
      "api_calls": 1,
      "run_dir": "..."
    },
    "events": [
      {
        "timestamp": "2026-09-06T17:34:39Z",
        "type": "PRE_PROVIDER_QUOTA_429",
        "fixture": "FS-I13",
        "reservation_id": "...",
        "model_request_started": false,
        "message": "Provider quota exhausted before review transport started."
      }
    ]
  }
}
```

## Source rules

The VPS publisher should be deterministic and read-only. Suggested sources:

- current mission / fixture: existing mission state and `state/autonomy/SNAPSHOT.json`;
- compute limits: `state/autonomy/compute/BUDGET.json`;
- starts: `reservations.jsonl`;
- reconciled model usage: `gated_usage.jsonl` plus existing usage audit;
- void count: `reservation_voids.jsonl`;
- provider cooldown: `provider-cooldown.json`;
- last review: latest completed `state/autonomy/compute/runs/*/manifest.json` plus reconciled usage;
- runtime events: append-only projections from review manifests, reservation/void events and mission progression.

Do not publish credentials, prompts, response bodies or bearer tokens.

## Required semantics

1. A cooldown is active only when an exact `retry_not_before_utc` exists and is in the future.
2. Historical quota error text is evidence of a past failure, not an active cooldown.
3. A voided reservation must not count as an open reservation or a run start.
4. `OPEN_USAGE_MISSING` remains fail-closed and must be represented as an unverified-usage block.
5. Runtime events are audit facts, not LLM summaries.
6. Every field is optional during migration. Missing data stays missing in the OS.

## Manual model calls

The browser now checks `/api/os/snapshot` before starting a manual research run. Full parity with the autonomous Research Review Router requires a future VPS endpoint that atomically reserves compute for `source=manual_chat|brain_studio|improvement_research` and reconciles native usage into the same append-only ledger. Until that endpoint exists, the OS labels the accounting gap explicitly and never claims atomic reservation coverage.
