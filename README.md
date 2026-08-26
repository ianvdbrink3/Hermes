# Hermes Investment OS

A protected web control plane for **Hermes Agent** investment workflows. The OS runs on Vercel while Hermes itself runs on a persistent machine/VPS.

The architectural rule is simple: **Hermes is the source of truth for its investment plan, sessions, research, backtests, skills, files and self-improvement. The web OS is the cockpit around Hermes, not a second investment brain.**

## v0.3.4 — System Readiness

`/brain/system` is the activation and diagnostics center for the Hermes VPS cutover.

It adds:

- read-only automatic checks for OS authentication and the production mutation guard;
- production gateway, sessions, models, skills, toolsets and capabilities checks;
- research gateway, sessions and capabilities checks;
- explicit visibility for whether `his-production`, `his-research` and optional `his-builder` are configured;
- a visible OS version + Git commit indicator from `/brain`, so immutable/old Vercel deployments are immediately recognizable;
- manual verification state for streaming, conversation persistence, Current Plan and the final Mac-off continuity test;
- a seven-phase VPS cutover runbook that preserves the existing Hermes brain before migration.

Diagnostics never expose API keys or passwords and never create sessions or run Hermes research automatically. Interactive validation remains an explicit user action.

See `docs/hermes-vps-cutover-runbook.md` for the operational cutover sequence.

## v0.3.1 — Hermes Control Layer

`/brain` is now the primary Hermes-native control workspace.

### What it does

- Browses real Hermes sessions instead of creating a parallel chat store.
- Searches Hermes session content through the native sessions API.
- Loads full persisted message history, including tool-call records when Hermes returns them.
- Exposes `his-production` as an **inspect-only** source view so existing work, backtests and plans can be reviewed without adding a production mutation path to the browser.
- Exposes explicitly configured `his-research` sessions as the interactive workspace.
- Creates, renames, forks and exports research sessions using Hermes-native session endpoints.
- Streams research chat from Hermes over SSE and surfaces live assistant output and tool/subagent activity.
- Supports research-run stop and steer controls when Hermes exposes a run id for the active turn.
- Provides Hermes-native quick actions such as Continue current plan, Review progress, Show blockers, Review latest backtest, Explain architecture and Continue last research.
- Adds **Mission Control / Current Plan**. Hermes is instructed to inspect its own persisted sessions, memory, files, research and backtests and return the current objective, completed work, work in progress, next step and blockers. The OS does not invent this roadmap.
- Adds an **Activity** view sourced from real historical tool calls and new live SSE events.
- Adds an **Artifacts foundation** that detects actual artifact/file paths mentioned in Hermes transcripts or tool events. No fake file inventory is generated when Hermes does not expose one.
- Keeps the v0.3 capability/self-improvement workspace available at `/brain/lab`.

### What it deliberately does not do

- It does not recreate Hermes backtests, strategy logic or research plans in Next.js.
- It does not maintain a competing experiment engine or second investment-memory system.
- It does not allow interactive agent turns against `his-production` from Brain Studio.
- It does not expose a browser endpoint for builder mutation, production promotion, rollback or broker execution.
- It does not fabricate sessions, skills, backtests, artifacts or plan state when Hermes is unavailable.

## Architecture

```text
Browser
  -> authenticated Next.js / Vercel control plane
      -> protected /api/hermes/*, /api/brain/* and /api/risk/*
          -> server-side Hermes credentials
              -> Hermes gateways/profiles
                  -> his-production
                     sessions / plan / research / backtests
                     INSPECT ONLY from Hermes Control

                  -> his-research
                     persistent sessions
                     tools / research / self-development
                     INTERACTIVE from Hermes Control

                  -> his-builder
                     optional future capability-building environment
                     no browser mutation path in v0.3.1

Hermes owns intelligence and its own plan.
External deterministic guards own execution safety.
```

## Brain routes

- `/brain` — Hermes Control
- `/brain/system` — System Readiness / Activation Center
- `/brain/lab` — v0.3 Improvement Lab / capability explorer

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000` for the Investment OS and `http://localhost:3000/brain` for Hermes Control.

## Production Hermes environment

```bash
HERMES_MOCK_MODE=false
HERMES_BASE_URL=https://hermes.example.com
HERMES_API_KEY=your-production-hermes-api-key
HERMES_PATH_PREFIX=
HERMES_SESSION_KEY=agent:investment:webos:primary

OS_ACCESS_PASSWORD=your-strong-owner-password
OS_SESSION_SECRET=at-least-32-random-characters
```

For a dedicated `his-production` gateway, leave `HERMES_PATH_PREFIX` empty. For a multiplex gateway use an explicit path such as:

```bash
HERMES_PATH_PREFIX=/p/his-production
```

## Research profile isolation

Research is **not** silently inferred from production. Interactive Hermes Control requires an explicitly configured research route and a research-specific API key.

Shared multiplex origin:

```bash
HERMES_RESEARCH_PATH_PREFIX=/p/his-research
HERMES_RESEARCH_API_KEY=research-profile-api-server-key
HERMES_RESEARCH_SESSION_KEY=agent:investment:brain:research
```

Dedicated research gateway:

```bash
HERMES_RESEARCH_BASE_URL=https://research-hermes.example.com
HERMES_RESEARCH_API_KEY=research-profile-api-server-key
HERMES_RESEARCH_PATH_PREFIX=
HERMES_RESEARCH_SESSION_KEY=agent:investment:brain:research
```

Builder variables remain available for future use, but v0.3.1 provides no builder chat or mutation surface.

## Security model

1. Hermes API keys remain server-side and are never exposed through `NEXT_PUBLIC_*` values.
2. The OS fails closed when owner authentication is not configured correctly.
3. Owner sessions are signed, HttpOnly, `SameSite=Strict`, and `Secure` in production.
4. `/api/hermes/*`, `/api/brain/*`, and `/api/risk/*` require a valid owner session.
5. Protected mutations require same-origin browser context and use the existing best-effort per-instance mutation rate limit.
6. `his-research` never falls back to the production API key.
7. Production session listing/history/export is allowed, but production session creation, edits, forks and interactive chat are blocked by the web API.
8. Research session mutation is limited to explicit session operations. There is no generic arbitrary Hermes proxy route.
9. Broker execution remains outside Brain Studio and hard-locked unless a separate authoritative execution-control service is configured.

## Hermes API routes used by v0.3.1

Production/research inspection:

- `GET /api/sessions`
- `GET /api/sessions/search`
- `GET /api/sessions/stats`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/messages`
- `GET /api/sessions/:id/export`

Research-only interaction:

- `POST /api/sessions`
- `PATCH /api/sessions/:id`
- `POST /api/sessions/:id/fork`
- `POST /api/sessions/:id/chat/stream`
- `POST /v1/runs/:runId/stop`
- `POST /v1/runs/:runId/steer`

Brain inventory:

- `GET /v1/skills`
- `GET /v1/toolsets`
- `GET /v1/capabilities`
- `GET /v1/models`

Existing Investment OS routes still include Hermes health, runs and Jobs API access.

## v0.3 Improvement Lab

The previous Brain Studio capability/self-improvement UI remains at `/brain/lab`. It keeps its original guardrails: draft improvement objects are ephemeral and cannot authorize production promotion, skill mutation or broker execution.

## Build and deployment

GitHub Actions installs the committed dependency graph with `npm ci` and runs `next build`. Vercel deploys from the Git-connected repository.

## Activation dependency

The UI and protected proxy layer can be deployed before the VPS migration. Full interactive Hermes Control becomes active only after the persistent Hermes host exposes the required session endpoints and `his-research` is explicitly connected in Vercel. Until then, disconnected state is shown rather than mock intelligence.
