# v0.3 Implementation Boundary

## Implemented

Brain Studio route/navigation, protected Brain APIs, deterministic production capability inspection, explicit research-profile execution, typed improvement requests, a centralized improvement state model, a research-first Self-Improvement Lab, capability filtering, production lock messaging, honest disconnected states, responsive UI, and changelog/pipeline foundations.

## Architecture

`src/lib/brain/*` owns domain types, Hermes transport and server services. `src/app/api/brain/*` is the authenticated server boundary. `src/components/brain-studio.tsx` is the interactive workspace and never receives API credentials.

## Hermes integration

Production inspection uses `/v1/skills`, `/v1/toolsets`, `/v1/capabilities` and `/v1/models` when available. Research uses `/v1/runs` only after `his-research` is explicitly configured with its own key.

## Not yet connected

Durable improvement persistence, tool-event SSE, experiment execution, baseline-vs-challenger evaluation, OOS validation, `skill_manage`, persistent approvals, production promotion/version manifests, and rollback execution.

## Safety boundary

Brain Studio v0.3 cannot run the production agent, mutate builder skills, approve changes, promote changes, modify risk limits or execute trades. Production remains inspect-only from Brain Studio.
