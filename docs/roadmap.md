# Implementation milestones

This is a dependency plan, **not** proof of completed runtime implementation.

- **R0, scaffold**: project structure, provisional JSON schemas, ADR, kit descriptors and offline tests. This folder is the initial artifact.
- **R1, contract validation**: formal Draft 2020-12 validator + positive/negative fixtures; GitHub CI with pinned actionlint, tested at the exact PR SHA; no payments. (Integrated on main; SHA-exact CI green.)
- **R2, pure renderer/status**: R2a read-only status/drift and dry-run, R2b read-only three-way merge preview (both merged on main); R2c read-only canonical candidate manifest + local SHA-256 (draft PR #10). Real template renderer, immutable provenance, overlays, idempotent install plans and security review remain future work, without external paid models.
- **R3, OpenCode + OpenSpec kit**: port manual phases, OPSX, strict checklist, durable checkpoint guards and safe PR publisher without ASF V3 workflow_call. No LLM/payments in CI; mock provider tests.
- **R4, optional OpenCode direct**: same policies and protected paths, shared per-repo paid-job concurrency, independent profile installation.
- **R5, PR installer/upgrade/rollback**: compare effective versions, prepare draft PR, preserve overlays, conflict halt and no direct settings writes.
- **R6, qualification**: clean and existing repo fixtures, negative security scenarios, upgrade and rollback across two published-candidate versions, SHA-exact CI on a separate test repo. Publish first real SemVer release only after review.
- **R7, operational qualification**: approval-specific GitHub App, secrets, rulesets and one owner-approved paid OpenRouter pilot. Never an automatic installer side effect.

R0-R2c are not proof of a live agent installation or an attestable GitHub release. Track R2b remaining work in issue #7 and tag/provenance security in issue #9. No permission, secret, tag, GitHub App or paid pilot is authorized by a tooling PR.
