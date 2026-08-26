# Brain Studio v0.3

Brain Studio is the first control plane for controlled recursive improvement of Hermes Investment OS.

## Active in v0.3

- Inspect production skills, toolsets, API capabilities and model metadata through protected server-side adapters.
- Run evidence-based self-improvement research only through an explicitly configured `his-research` profile.
- Create typed improvement drafts with explicit source/target profiles.
- Show a truthful improvement pipeline and production lock state.

## Not active in v0.3

- Production-agent runs from Brain Studio.
- Builder skill mutation.
- Historical/OOS evaluation execution.
- Approval persistence.
- Production promotion.
- Rollback execution.

The Hermes API server exposes a powerful toolset including terminal/file/skills tools. Therefore Brain Studio does not treat a prompt-level instruction such as “read only” as a sufficient production security boundary. Production is inspect-only through deterministic read endpoints until a stronger tool-policy boundary exists.

## Persistence

Improvement drafts currently use process-local memory and are explicitly labelled ephemeral. This store must never be used as the source of truth for future approvals or production versions.
