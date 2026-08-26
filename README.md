# Hermes Investment OS

A protected web control plane for **Hermes Agent** investment workflows. The application runs on Vercel while Hermes itself runs on a persistent machine/VPS.

## v0.3 — Brain Studio

v0.3 introduces `/brain`: the first control plane for evolving Hermes investment intelligence without silently changing production.

Implemented in this release:

- Hermes Brain Console for an explicitly isolated `his-research` profile.
- Production brain inspection through deterministic read endpoints; Brain Studio does not start production agent runs in v0.3.
- Server-side profile-aware Hermes transport. Browser code never receives Hermes credentials.
- Real deterministic discovery from Hermes `GET /v1/skills`, `GET /v1/toolsets`, `GET /v1/capabilities`, and `GET /v1/models` when the production gateway exposes them.
- Brain Status and Capability Explorer with truthful loading/offline/not-configured states.
- Typed `ImprovementRequest` domain model and centralized improvement state machine.
- Self-Improvement Lab that creates explicit draft requests and can hand research work to `his-research` once connected.
- Improvement pipeline foundation from Research through Production.
- Production mutation, skill building, approval, promotion and rollback execution are intentionally disabled in v0.3.
- Brain changelog foundation that does not invent production history.
- All `/api/brain/*` routes are protected by the same owner session, CSRF and mutation rate-limit boundary as the existing Hermes/risk routes.

Current v0.3 improvement storage is intentionally **ephemeral process memory**. Drafts may disappear on Vercel cold start/redeploy. It is not used for production approval or promotion state.

## Architecture

```text
Browser
  -> authenticated Next.js / Vercel control plane
      -> protected /api/hermes/*, /api/brain/* and /api/risk/*
          -> server-side Hermes credentials
              -> Hermes gateways/profiles
                  -> his-production (deterministic inspection only in Brain Studio)
                  -> his-research (optional, isolated agent runs)
                  -> his-builder (optional, mutation disabled in v0.3)

Brain evolution target:
Observe / diagnose
  -> Research
  -> Proposed capability
  -> Build
  -> Historical evaluation
  -> Out-of-sample validation
  -> Human review
  -> Production promotion
```

Production promotion is never inferred from a successful test and is not implemented in v0.3.

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000` for the Investment OS and `http://localhost:3000/brain` for Brain Studio.

## Production Hermes environment

```bash
HERMES_MOCK_MODE=false
HERMES_BASE_URL=https://hermes.example.com
HERMES_API_KEY=your-hermes-api-key
HERMES_PATH_PREFIX=
HERMES_SESSION_KEY=agent:investment:webos:primary

OS_ACCESS_PASSWORD=your-strong-owner-password
OS_SESSION_SECRET=at-least-32-random-characters
```

For a dedicated `his-production` gateway, leave `HERMES_PATH_PREFIX` empty. For a multiplex gateway use an explicit path such as:

```bash
HERMES_PATH_PREFIX=/p/his-production
```

## Brain Studio profile isolation

Research and builder profiles are **not** assumed to exist. Brain Studio treats them as `NOT CONFIGURED` until an explicit base URL or path prefix is set **and** the profile has its own API key.

For a shared multiplex gateway the network origin may be the same as production, but named profile prefixes still use profile-specific keys:

```bash
HERMES_RESEARCH_PATH_PREFIX=/p/his-research
HERMES_RESEARCH_API_KEY=research-profile-api-server-key

HERMES_BUILDER_PATH_PREFIX=/p/his-builder
HERMES_BUILDER_API_KEY=builder-profile-api-server-key
```

A dedicated research gateway can instead use:

```bash
HERMES_RESEARCH_BASE_URL=https://research-hermes.example.com
HERMES_RESEARCH_API_KEY=research-profile-api-server-key
HERMES_RESEARCH_PATH_PREFIX=
```

Builder configuration may be present for status visibility, but v0.3 rejects builder runs and exposes no skill mutation or production promotion endpoint.

## Security model

1. Hermes API keys remain server-side and are never exposed through `NEXT_PUBLIC_*` values.
2. The OS fails closed when `OS_ACCESS_PASSWORD` or `OS_SESSION_SECRET` is missing/weak.
3. Owner sessions are signed, HttpOnly, `SameSite=Strict`, and `Secure` in production.
4. `/api/hermes/*`, `/api/brain/*`, and `/api/risk/*` require a valid owner session.
5. Protected mutations require same-origin browser context and use the existing best-effort per-instance mutation rate limit.
6. Research is profile-isolated: Brain Studio never falls back to the production API key for `his-research` or `his-builder`.
7. Brain Studio does not start production agent runs in v0.3 because the Hermes API server exposes a powerful toolset; prompt-level “read only” instructions are not treated as a sufficient production security boundary.
8. No v0.3 Brain API can approve, promote, rollback or mutate production capabilities.
9. Broker execution remains hard-locked unless a separate execution-control service is configured.

## Hermes API routes used

Existing OS:

- `GET /health/detailed`
- `POST /v1/runs`
- `GET /v1/runs/:runId`
- `POST /v1/runs/:runId/stop`
- `POST /v1/runs/:runId/approval`
- `GET /api/jobs`

Brain Studio production inspection:

- `GET /v1/skills`
- `GET /v1/toolsets`
- `GET /v1/capabilities`
- `GET /v1/models`

Brain Studio research, only after `his-research` is explicitly configured:

- `POST /v1/runs`
- `GET /v1/runs/:runId`

## Intentionally not connected in v0.3

- Durable improvement/experiment database.
- Historical evaluation engine.
- Out-of-sample evaluation engine.
- Structured capability-proposal parsing.
- Tool-event SSE timeline.
- `skill_manage` builder integration.
- Human approval persistence.
- Production version manifests.
- Promotion and rollback execution.

These remain explicit future stages rather than fake UI actions.

## Build and deployment

GitHub Actions installs the committed dependency graph with `npm ci` and runs `next build`. Vercel deploys from the Git-connected repository.

## Next recommended release

**v0.4 — Experiment Engine**: durable experiments, baseline-vs-challenger evaluation, historical vs out-of-sample datasets, objective metrics, and persistent evidence suitable for later human approval.
