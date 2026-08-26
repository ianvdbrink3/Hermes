# Hermes VPS cutover runbook

This runbook is intentionally operational. It does not redesign Hermes' investment plan, strategy, backtests or memory. Hermes remains the source of truth; the OS only moves the persistent runtime and verifies connectivity.

## Rule zero — preserve the existing Hermes brain

Before installing or migrating anything, inventory the existing Mac profile and create a backup. The cutover is not complete if the VPS starts with an empty `his-production` profile while the real investment state remains only on the Mac.

Preserve or explicitly account for:

- profile configuration;
- sessions and conversation history;
- memory;
- skills;
- investment-system project files;
- research notes;
- backtests and datasets;
- jobs/schedules;
- any paths or tools that are Mac-specific and therefore cannot be copied blindly.

## Phase 1 — Oracle host

1. SSH into the new instance.
2. Verify architecture, OS and available memory.
3. Inspect existing swap before adding a swapfile.
4. Confirm package/network access.
5. Confirm only intended public ports are open.
6. Keep the old Mac Hermes gateway online during the migration.

## Phase 2 — Hermes install

1. Verify current official Hermes Linux installation instructions before installing.
2. Install Hermes cleanly on the VPS.
3. Do not copy platform-specific Mac configuration blindly.
4. Restore or selectively migrate the preserved investment state.
5. Start `his-production` and verify it locally first.
6. Create a separate `his-research` profile and separate API credential.
7. Leave `his-builder` optional until builder work is explicitly needed.

## Phase 3 — secure public origin

Hermes should remain bound behind a secure HTTPS origin. Do not expose the Hermes API bearer token over plaintext HTTP.

Target shape:

```text
Internet
  -> HTTPS :443
      -> reverse proxy / secure tunnel
          -> Hermes on loopback/private port
```

Keep the Hermes application port itself closed to the public internet when possible.

## Phase 4 — Vercel environment

Production:

```text
HERMES_MOCK_MODE=false
HERMES_BASE_URL=<secure production origin>
HERMES_API_KEY=<production key>
HERMES_PATH_PREFIX=
HERMES_SESSION_KEY=agent:investment:webos:primary
```

Research, dedicated origin:

```text
HERMES_RESEARCH_BASE_URL=<secure research origin>
HERMES_RESEARCH_API_KEY=<research-only key>
HERMES_RESEARCH_PATH_PREFIX=
HERMES_RESEARCH_SESSION_KEY=agent:investment:brain:research
```

Research, shared multiplex origin:

```text
HERMES_RESEARCH_PATH_PREFIX=/p/his-research
HERMES_RESEARCH_API_KEY=<research-only key>
HERMES_RESEARCH_SESSION_KEY=agent:investment:brain:research
```

Never reuse the production API key as the research key.

## Phase 5 — System Readiness

Open:

```text
/brain/system
```

Run diagnostics and require all automatic required checks to pass:

- OS authentication;
- production mutation guard;
- production profile configuration;
- production gateway;
- production sessions;
- production skills;
- production toolsets;
- production capabilities;
- research profile configuration;
- research gateway;
- research sessions.

The diagnostics endpoint is read-only and does not create Hermes sessions or run research.

## Phase 6 — manual functional verification

These checks require real user actions and therefore are not automated by diagnostics:

1. Send one real message in Research and confirm streaming output.
2. Reload the OS and confirm the conversation persists.
3. Refresh Current Plan and verify it is grounded in Hermes' existing state.
4. Open or identify one real backtest/research artifact.
5. Verify Production remains inspect-only from Hermes Control.

## Phase 7 — Mac-off continuity

Only after the VPS checks pass:

1. Stop the old Mac Hermes gateway.
2. Refresh `/brain/system`.
3. Confirm Production and Research automatic checks still pass.
4. Open Hermes Control.
5. Send another Research message.
6. Confirm existing Production history remains available.

At this point the persistent VPS can be considered authoritative.

## Rollback

If any critical check fails after stopping the Mac gateway:

1. do not change or delete preserved Mac state;
2. restore the old Vercel Hermes origin if necessary;
3. restart the old Mac gateway;
4. diagnose the VPS independently;
5. repeat the cutover only after `/brain/system` is clean.

Broker execution remains outside this cutover and must stay locked until a separate execution-control milestone is deliberately completed.
