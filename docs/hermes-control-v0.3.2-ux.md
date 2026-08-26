# Hermes Control v0.3.2 — UX/UI usability overhaul

## Goal

Hermes Control should feel like a polished operating system for working with one persistent investment intelligence, not like a frontend that exposes an agent backend.

The redesign follows one rule: **simple by default, powerful on demand**.

## UX audit of v0.3.1

The v0.3.1 control layer had useful functionality, but its information architecture exposed too much of the underlying runtime at once:

- a six-cell technical status strip competed with the user's actual work;
- raw `his-production` / `his-research` profile names were primary navigation concepts;
- sessions, chat, Mission Control, tool activity, artifacts and brain inventory were all visible simultaneously in a dense three-column layout;
- the chat looked closer to a technical console than a daily AI workspace;
- tool calls and raw artifact paths had too much visual priority;
- Current Plan was useful but competed with several equally weighted side panels;
- there was no first-class answer to “does Hermes need anything from me?”;
- session IDs, run IDs and backend errors surfaced too early;
- mobile inherited the desktop mental model rather than a mobile-first priority order.

## New information architecture

`/brain` is now organized around four user concepts:

1. **Overview** — what Hermes is doing, whether it needs the user, what is next, and how to continue.
2. **Chat** — the primary interface for working with Hermes.
3. **Work** — Current Plan and human-readable activity.
4. **Library** — research/output artifacts and secondary brain capability information.

`/brain/lab` remains separate as **Brain Lab**: Hermes Control is for working with Hermes; Brain Lab is for improving Hermes.

Technical concepts such as profile name, session ID, run ID, model, raw errors, raw tool payloads and raw artifact paths remain accessible through progressive disclosure.

## Main interaction changes

### Overview

The default page now prioritizes:

- Hermes work state;
- current work;
- environment;
- Continue with Hermes;
- Ask Hermes;
- Needs You;
- next step;
- continuity with the most recent selected conversation;
- concise recent activity and conversations.

No plan, blocker or artifact data is fabricated when Hermes has not supplied it.

### Research and Production

The primary vocabulary is now **Research** and **Production**.

- Research: interactive development/research workspace.
- Production: protected, read-only inspection of approved Hermes work.

Raw profile names remain available in Technical details.

### Chat

The permanent session sidebar was removed from the main workspace. Conversations now live in a drawer so the transcript has more space.

Chat now includes:

- readable, lightly styled user/Hermes messages;
- persistent composer;
- context-aware prompt suggestions;
- Cmd/Ctrl+Enter to send;
- natural streaming state;
- stop action when an active run ID exists;
- steer/guidance control behind disclosure;
- tool activity collapsed by default;
- raw tool payloads behind Technical details;
- rename, branch and export preserved in a secondary menu.

### Current Plan / Needs You

Current Plan is now a readable work-state view with:

- Current objective;
- In progress;
- Next;
- Needs You;
- Completed work;
- Important context;
- raw Hermes snapshot on demand.

`Needs You` is derived only from Hermes' reported blocker state. If no plan snapshot exists, the UI explicitly says that the state is unknown instead of inventing “no blockers”.

### Activity

Low-level events are grouped into meaningful work units and translated into human language. Raw technical event types remain available in nested details.

### Library

Artifact paths detected in real Hermes output are presented as a library with human-readable file types and filenames. The raw path moves to an artifact detail drawer. Hermes Control does not pretend that a direct file viewer exists without a real retrieval endpoint.

Skills and toolsets remain available but are visually secondary and point users toward Brain Lab for deeper brain development.

### Search / command palette

Cmd/Ctrl+K opens Search Hermes. It can currently:

- navigate to common Hermes actions;
- continue the current plan;
- review the latest backtest;
- open plan/activity/library;
- start a new conversation;
- search currently loaded conversations;
- search currently detected outputs;
- open Brain Lab.

This is intentionally a client-side search over already loaded Hermes data, not a fabricated global index.

## Responsive behavior

### Desktop

A single OS sidebar + wide workspace is used. Conversations and technical context appear on demand in drawers instead of permanently consuming width.

### Tablet / <= 900px

The desktop sidebar becomes a compact bottom navigation with Overview, Chat, Work and Library. Work context stacks below the primary content.

### Mobile / <= 640px

Priority is:

1. current state;
2. environment;
3. chat/action;
4. Needs You;
5. current plan/activity;
6. Library / advanced details.

Chat becomes edge-to-edge, suggestion chips scroll horizontally, drawers become full-screen and desktop multi-column content stacks.

A dedicated 390px breakpoint handles narrow phone widths.

## Preserved backend and safety behavior

The redesign does not change the Hermes service contract or execution boundary:

- persisted session browsing/search/history remains;
- research session creation/rename/branch/export remains;
- streaming chat remains;
- live tool/subagent events remain;
- run stop/steer remains;
- production remains browser read-only;
- research still requires its own explicit API configuration;
- Brain Lab remains at `/brain/lab`;
- no builder mutation or production promotion was added;
- broker execution remains outside Hermes Control.

## Verification

The repository currently defines `dev`, `build` and `start` scripts. It does not define separate lint or test scripts.

- GitHub Actions installs with `npm ci` and runs `next build`.
- `next build` provides the repository's TypeScript compilation/type-check gate.
- The v0.3.2 branch build is required to be green before merge.
- Separate lint/test results cannot be claimed until those scripts exist.

### Browser / visual QA limitation

The connected environment could inspect the real source and deployment status, but could not open the protected Vercel `/brain` page in an interactive browser or obtain a rendered screenshot. Therefore visual QA at 1440/1024/768/390 cannot honestly be claimed from this environment. Responsive rules for those widths are implemented in CSS, and the build gate verifies compilation; final pixel-level browser QA remains a follow-up when an authenticated browser session is available.

## Remaining UX limitations

- Current Plan is still a Hermes-generated structured text snapshot rather than a durable server-side work-state object.
- Artifact discovery still depends on paths appearing in Hermes transcript/tool output; it is not yet a real workspace filesystem index.
- Search is not yet a server-side global search across all Hermes memory/files.
- Activity grouping is heuristic because the current event contract does not provide a richer semantic work-unit model.
- There is no durable cross-session notification center for completed background work yet.

These are backend/product-state limitations rather than reasons to expose more technical complexity in the default UI.