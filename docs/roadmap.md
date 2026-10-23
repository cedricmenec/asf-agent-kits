# Implementation milestones

This is a dependency plan, **not** proof of completed runtime implementation.

- **R0, scaffold**: project structure, provisional JSON schemas, ADR, kit descriptors and offline tests. This folder is the initial artifact.
- **R1, contract validation**: formal Draft 2020-12 validator + positive/negative fixtures; GitHub CI with pinned actionlint, tested at the exact PR SHA; no payments. (Integrated on main; SHA-exact CI green.)
- **R2, offline renderer/status (prototypes integrated)**: R2a status/dry-run, R2b three-way merge preview, R2c canonical candidate manifest, and R2d-01/02/03/04 deterministic template previews, manifest composition, target collision detection and explicit ownership/overlay rejection. All remain read-only, with no verified source provenance, atomic installer or runtime activation. See PR #25, #27, #29 and #31.
- **R3, OpenCode + OpenSpec kit (partial)**: R3a manual-policy, R3b GitHub proof preview, R3c GET-only adapter, R3d SHA host binding, R3e-01 host identity/permissions contract and R3e-02 simulated identity bootstrap are integrated (PR #23 and #33 for R3e). They **do not authenticate a real host** or authorize payments. Still to implement: real manual runtime phases, OPSX, strict checklist, durable checkpoints and a safe PR publisher without ASF V3 workflow_call. R3e-03 is an explicit host/installation qualification gate.
- **R4, optional OpenCode direct**: same policies and protected paths, shared per-repo paid-job concurrency, independent profile installation.
- **R5, PR installer/upgrade/rollback**: compare effective versions, prepare draft PR, preserve overlays, conflict halt and no direct settings writes.
- **R6, qualification**: clean and existing repo fixtures, negative security scenarios, upgrade and rollback across two published-candidate versions, SHA-exact CI on a separate test repo. Publish first real SemVer release only after review.
- **R7, operational qualification**: approval-specific GitHub App, secrets, rulesets and one owner-approved paid OpenRouter pilot. Never an automatic installer side effect.

Integrated R0-R3e-02 prototypes are not proof of a live agent installation, independently authenticated GitHub host or attested release. Track open items in issues #7 (R2), #9 (SEC-02) and #22 (R3e), and in the [living Notion roadmap](https://app.notion.com/p/40112ac91636818dab99de3813963c0c). No permission, secret, tag, GitHub App change, production workflow or paid pilot is authorized by a tooling PR.
