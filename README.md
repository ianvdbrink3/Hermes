# Hermes Investment OS

A web control plane for **Hermes Agent** investment workflows. The application runs on Vercel while Hermes itself runs on a persistent machine/VPS.

## v0.2

- Dedicated Hermes gateways use direct `/v1`, `/health` and `/api` paths by default.
- Optional `HERMES_PATH_PREFIX` supports an explicit multiplex gateway.
- Signed 12-hour HttpOnly owner sessions protect the OS and all `/api/hermes/*` and `/api/risk/*` routes.
- Mutating protected API requests require same-origin browser context and are rate limited.
- Login attempts are rate limited.
- `package-lock.json` is committed and CI uses `npm ci`.
- Next.js generated type include paths are persisted in `tsconfig.json`.

## Architecture

```text
Browser
  -> authenticated Next.js / Vercel control plane
      -> protected server-side /api/hermes/* proxy
          -> secure Cloudflare Tunnel
              -> dedicated Hermes profile gateway
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
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Required Vercel environment

```bash
HERMES_MOCK_MODE=false
HERMES_BASE_URL=https://hermes.example.com
HERMES_API_KEY=your-hermes-api-key
HERMES_PATH_PREFIX=
HERMES_SESSION_KEY=agent:investment:webos:primary

OS_ACCESS_PASSWORD=your-strong-owner-password
OS_SESSION_SECRET=at-least-32-random-characters
```

For a dedicated profile gateway such as `hermes -p his-production gateway`, leave `HERMES_PATH_PREFIX` empty and do not set `HERMES_PROFILE`. Requests go directly to `/v1/...`, `/health/detailed` and `/api/jobs`.

Only when using a Hermes multiplex gateway should you explicitly set a path prefix, for example:

```bash
HERMES_PATH_PREFIX=/p/his-production
```

## Security model

1. The browser never receives `HERMES_API_KEY`.
2. The OS fails closed when `OS_ACCESS_PASSWORD` or `OS_SESSION_SECRET` is missing/weak.
3. Owner sessions are HMAC-signed, HttpOnly and `SameSite=Strict`; production cookies are `Secure`.
4. Protected mutation requests are rejected unless they are same-origin.
5. Protected mutation requests have a best-effort per-instance rate limit; use a shared durable limiter before exposing execution endpoints to broader traffic.
6. Broker credentials must never be sent to the browser.
7. Broker execution remains hard-locked unless a separate execution-control service is configured.
8. A production execution service must remain authoritative over `TRADING_ENABLED` and any LLM request.

## Hermes API routes currently used

- `GET /health/detailed`
- `POST /v1/runs`
- `GET /v1/runs/:runId`
- `POST /v1/runs/:runId/stop`
- `POST /v1/runs/:runId/approval`
- `GET /api/jobs`

## Build and deployment

GitHub Actions installs exactly the committed dependency graph with `npm ci` and runs `next build`. Vercel deploys from the Git-connected repository.

## Next build targets

- Hermes SSE live event timeline (`/v1/runs/:runId/events`)
- Jobs create/pause/resume/run controls
- Sessions browser and persistent CIO chat
- Hermes skills/toolsets explorer
- Shared/durable rate limiting
- Real market-data adapter on the Hermes host
- Separate risk/execution daemon for LYNX/TWS Paper Trading
- Immutable trade/outcome database and strategy validation engine
