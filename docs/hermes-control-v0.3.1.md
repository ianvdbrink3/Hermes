# Hermes Control v0.3.1

## Purpose

Hermes Control makes the Investment OS a cockpit over Hermes rather than a replacement for Hermes. Existing Hermes sessions, research, plans, backtests and tool output remain authoritative.

## Runtime modes

| Mode | Profile | Browser permissions |
| --- | --- | --- |
| Production source | `his-production` | list/search/read/export sessions; inspect skills/toolsets/capabilities |
| Research workspace | `his-research` | list/search/read/create/rename/fork/export sessions; interactive streaming chat; stop/steer exposed research runs |
| Builder | `his-builder` | no interactive v0.3.1 browser surface |
| Broker execution | external | not controlled by Brain Studio |

## Evening activation checklist

Do not paste credentials into issues, chat transcripts or commits.

1. Bring the persistent Oracle host online and verify SSH access.
2. Install/verify Hermes on the persistent host.
3. Preserve the existing `his-production` investment workspace/state when moving off the Mac; verify the migrated profile before deleting or changing the original.
4. Expose a secure authenticated HTTPS Hermes gateway. Do not send bearer credentials over plain HTTP.
5. Verify production endpoints directly on the host before changing Vercel:
   - `/health/detailed`
   - `/api/sessions`
   - `/api/sessions/stats`
   - `/v1/skills`
   - `/v1/toolsets`
   - `/v1/capabilities`
6. Configure an isolated `his-research` profile. The research profile should receive the investment context/workspace that Hermes actually needs to continue its established plan; do not invent a new plan in the OS.
7. Give `his-research` its own API-server key.
8. Verify research session operations on the host:
   - list sessions
   - create session
   - message history
   - fork session
   - streaming chat
9. Configure Vercel server-side environment variables for production and research. Never create `NEXT_PUBLIC_*` Hermes secrets.
10. Redeploy `hermestradingos`.
11. Sign in to the OS and open `/brain`.
12. Verify `his-production` shows real sessions but no interactive composer.
13. Verify `his-research` can create/select a persisted session and stream a harmless inspection task.
14. Refresh Mission Control and confirm its Current Objective / Completed / In Progress / Next / Blockers content is grounded in Hermes' real existing plan.
15. Confirm Activity only displays tool/subagent events Hermes actually returns.
16. Confirm broker execution still shows locked and no Brain API exposes an execution mutation.

## Suggested first research instruction after activation

```text
Inspecteer eerst je bestaande investment-system plan, relevante persisted sessions, memory,
project files, recente backtests en research. Herstel je eigen actuele context en vertel kort
waar je daadwerkelijk gebleven was. Verander niets alleen om aan deze nieuwe webinterface te
voldoen. Ga uit van je bestaande architectuur en roadmap. Noem daarna één concrete eerstvolgende
actie die al in je plan past. Verander geen broker execution-instellingen of harde risk limits.
```

## Acceptance checks

A v0.3.1 activation is successful when:

- Existing Hermes work is visible through production session history.
- No fake sessions/capabilities/artifacts are shown when an endpoint is unavailable.
- Research sessions persist in Hermes, not only in browser state.
- A research chat turn streams assistant output.
- Tool activity appears when Hermes emits tool events.
- Session refresh shows the completed research turn after the stream ends.
- Mission Control can be regenerated from Hermes itself.
- Production session mutation returns a denial from the web control layer.
- Research requests never use the production API key fallback.
- Broker execution remains outside the Brain Studio API surface.

## Artifact behavior

v0.3.1 does not pretend Hermes exposes a generic workspace file API. The Artifacts panel detects concrete file paths present in actual session messages and live tool events. A future direct artifact viewer should only be added when a stable authenticated Hermes file/artifact endpoint is available or when a separate explicit workspace service is introduced.

## Rollback

The release only changes the Vercel control plane. It does not migrate Hermes data by itself and does not modify broker execution. If the new UI is faulty, revert the v0.3.1 application commit or redeploy the previous v0.3 release. Do not use application rollback as a substitute for backing up Hermes profile data before the host migration.
