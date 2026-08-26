# Brain Studio v0.3 — Security Review

- [x] Browser receives no Hermes API key. All Hermes transport is server-side.
- [x] `/api/brain/*` is covered by the owner-session proxy matcher.
- [x] Mutating Brain API requests use the existing same-origin CSRF check and mutation rate limiter.
- [x] Research runs require an explicitly configured `his-research` path/base and its own profile API key.
- [x] Research does not fall back to the production API key.
- [x] Builder runs and skill mutation are not exposed.
- [x] Production agent runs are rejected by Brain Studio; production inspection uses deterministic GET endpoints only.
- [x] No approve/promote/rollback Brain API endpoints exist in v0.3.
- [x] Ephemeral draft state is explicitly marked and cannot authorize production changes.
- [x] Brain Studio logs no bearer tokens or API keys.

Remaining pre-production work for future brain mutation: durable audit storage, strong shared rate limiting, explicit authorization for approval roles, immutable version manifests, builder sandbox/tool restrictions, evaluation evidence, and rollback semantics.
