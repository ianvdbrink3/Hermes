# Hermes Investment OS

A web control plane for **Hermes Agent** investment workflows. The application is designed to run on Vercel while Hermes itself runs on a persistent machine/VPS.

## What v0.1 includes

- Command Center for starting Hermes `/v1/runs`
- Polling of run state and CIO output
- Hermes detailed health/readiness proxy
- Native Hermes Jobs API view for scheduled automations
- Agent, market, strategy, trade, risk and memory control surfaces
- Server-side Hermes API authentication; the browser never receives `HERMES_API_KEY`
- Hard-locked broker execution unless a separate execution-control service is explicitly configured
- Safe mock mode so the UI works before Hermes is remotely reachable

## Architecture

```text
Browser
  -> Next.js / Vercel
      -> server-side /api/hermes/* proxy
          -> Hermes API Server (persistent VPS / machine)
              -> Hermes CIO + sub-agents + skills + jobs + memory

Future execution path:
Hermes strategy candidate
  -> deterministic Risk Guard
  -> external Execution Control service
  -> LYNX / TWS API
```

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

The default `.env.example` uses `HERMES_MOCK_MODE=true`. This is intentional: no live market values are invented and no orders can be sent.

## Connect Hermes

On the machine running Hermes, configure the Hermes API server with a strong `API_SERVER_KEY` and start the gateway. Do not expose an unauthenticated Hermes server to the public internet.

In the web app environment:

```bash
HERMES_MOCK_MODE=false
HERMES_BASE_URL=https://your-secure-hermes-endpoint.example
HERMES_API_KEY=your-strong-key
HERMES_PROFILE=investment-specialist
HERMES_SESSION_KEY=agent:investment:webos:primary
```

The application currently uses:

- `GET /health/detailed`
- `POST /v1/runs`
- `GET /v1/runs/:runId`
- `POST /v1/runs/:runId/stop`
- `POST /v1/runs/:runId/approval`
- `GET /api/jobs`

## Security model

1. `HERMES_API_KEY` stays server-side.
2. Broker credentials must never be sent to the browser.
3. Broker execution is **not** implemented in this UI.
4. The kill-switch route can only call an external execution-control service if `EXECUTION_CONTROL_URL` and `EXECUTION_CONTROL_KEY` are configured.
5. A production execution service should persist its own `TRADING_ENABLED=false` state and remain authoritative over any LLM request.

## Deployment

Import this GitHub repository into Vercel, then set environment variables in the Vercel project. Every subsequent push can deploy automatically through Git integration.

## Next build targets

- Hermes SSE live event timeline (`/v1/runs/:runId/events`)
- Jobs create/pause/resume/run controls
- Sessions browser and persistent CIO chat
- Hermes skills/toolsets explorer
- Real market-data adapter on the Hermes host
- Separate risk/execution daemon for LYNX/TWS Paper Trading
- Immutable trade/outcome database and strategy validation engine
