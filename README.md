# Hermes Investment OS

Hermes Investment OS is the protected web control plane around Hermes Agent. Hermes remains the source of truth for investment intelligence, research sessions, capabilities and persisted work; the OS observes, explains and safely initiates bounded research without becoming a second investment brain.

## v0.7.0 — Unified Research Control Plane

This release consolidates the OS around one runtime truth.

### Core rules

- `his-production` is inspect-only from the browser.
- Model-backed Brain Studio actions are `his-research` only.
- Browser-triggered trading activation is hard-disabled.
- The Research Review Router is the only scheduler recognized for autonomous semantic reviews; the deprecated Autonomous Investment Lab job is never used as fallback.
- Provider cooldowns are only treated as active when the authoritative state feed exposes an exact future retry timestamp. Historical quota text never creates a fake retry window.
- Manual research calls pass through the central runtime invocation policy before `/v1/runs` is called.
- Missing runtime, provider, usage or compute information is shown as missing rather than fabricated.

## Product structure

- `/` — daily overview: current mission, runtime state, AI usage, human action and safety.
- `/onderzoek` — Research Runtime Control Center: mission pipeline, provider state, compute usage, scheduler, audit events, experiments and backlog.
- `/trading` — controlled trading view. No browser execution path.
- `/instellingen` — connections, automation and release information.
- `/instellingen/systeem` — permanent System Health diagnostics.
- `/instellingen/geavanceerd` — Brain Studio for research-only intelligence improvement.

Legacy `/brain`, `/brain/system` and `/brain/lab` routes remain redirects for compatibility.

## Runtime Snapshot v1

`GET /api/os/snapshot` is the consolidated read-only OS contract. It normalizes the configured VPS state feed and the Research Review Router into:

```text
runtime
mission
provider
scheduler
compute
lastReview
events
safety
connections
telemetry
deployment
```

The web UI consumes this contract instead of independently inferring scheduler or provider truth on each page.

The preferred VPS state-feed contract should expose exact provider cooldown, rolling compute counters, reservation/void counts, last review and deterministic runtime events. Until those fields exist, the OS displays an explicit telemetry gap.

## Manual model invocation policy

`POST /api/brain/run` is research-only and checks the Runtime Snapshot before starting Hermes. Calls are blocked for active provider cooldowns, unverified provider-limit state, unverified model usage, integrity blocks and exhausted rolling budgets when those counters are available.

The current web repo cannot create the VPS-side atomic compute reservation used by the autonomous Research Review Router. The API reports this telemetry gap explicitly rather than claiming full atomic accounting. The long-term target is one server-side reservation/usage ledger for autonomous and manual model calls.

## Brain Studio improvements

Improvement research is no longer stored in a process-local Vercel `Map`. Creating an improvement now creates a persistent `his-research` Hermes session first and starts policy-gated research inside that session. The visible lifecycle is:

```text
DRAFT → RESEARCHING → PROPOSED → TESTING → VALIDATED → HUMAN_APPROVED → BUILT → PAPER → PRODUCTION
```

Only the research stage is automated by the current OS. Promotion and builder mutation remain disabled.

## Security

- Owner sessions are HMAC-signed, HttpOnly, `SameSite=Strict`, and secure in production.
- `/api/hermes/*`, `/api/brain/*`, `/api/risk/*`, `/api/os/*` and application pages require owner authentication.
- Mutating protected routes require same-origin requests and best-effort per-isolate throttling.
- High-value trading activation does not rely on that in-memory limiter because the browser execution endpoint is hard locked.
- Hermes API keys remain server-side.

## Architecture

```text
Browser
  → authenticated Next.js / Vercel OS
      → /api/os/snapshot
          → read-only VPS state feed
          → exact Research Review Router

      → research model invocation policy
          → his-research /v1/runs

      → production inspection APIs
          → his-production

      X browser trading activation
      X production model mutation
      X builder mutation / promotion
```

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The Git-connected deployment should run `npm ci` and `next build` before production promotion.
