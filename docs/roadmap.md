# Implementation milestones

This is a dependency plan, **not** proof of completed runtime implementation.

- **R0, scaffold**: project structure, provisional JSON schemas, ADR, kit descriptors and offline tests. This folder is the initial artifact.
- **R1, contract validation**: formal Draft 2020-12 validator + positive/negative fixtures; GitHub CI with pinned actionlint, tested at the exact PR SHA; no payments. (Implemented in stacked draft PR, subject to remote CI.)
- **R2, pure renderer/status**: R2a read-only dry-run/status and hash-based drift checking on synthetic candidate manifests (proposal in stacked draft PR), followed by R2b real renderer, three-way merge and deterministic/idempotent installation plan, without external paid models.
- **R3, OpenCode + OpenSpec kit**: port manual phases, OPSX, strict checklist, durable checkpoint guards and safe PR publisher without ASF V3 workflow_call. No LLM/payments in CI; mock provider tests.
- **R4, optional OpenCode direct**: same policies and protected paths, shared per-repo paid-job concurrency, independent profile installation.
- **R5, PR installer/upgrade/rollback**: compare effective versions, prepare draft PR, preserve overlays, conflict halt and no direct settings writes.
- **R6, qualification**: clean and existing repo fixtures, negative security scenarios, upgrade and rollback across two published-candidate versions, SHA-exact CI on a separate test repo. Publish first real SemVer release only after review.
- **R7, operational qualification**: approval-specific GitHub App, secrets, rulesets and one owner-approved paid OpenRouter pilot. Never an automatic installer side effect.

R0 alone is not proof of a live agent installation, nor of readiness for a paid execution.
