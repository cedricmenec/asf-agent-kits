# ASF Agent Kits

**Status: R0 design scaffold + stacked R1 contracts + R2a read-only planner prototype. NOT a released agent kit.**

This repository is intended to publish independently versioned, portable, manually-triggered agent kits for GitHub repositories. Initially it specifies:

- `opencode-openspec`: the standard OpenCode + OpenSpec profile, with manual `plan`, `apply`, `auto`, and `finalize` phases (not yet implemented in R0).
- `opencode-direct`: an optional independent OpenCode profile, disabled by default (not yet implemented in R0).

The shared core, release manifests, installer, drift detector, upgrade/rollback CLI, and actual agent workflows are **future milestones**. ASF Backlog Orchestrator V1, ASF Controller V3, waves, global CAS, and automatic paid retries are excluded from this initial distribution.

## R0 contents

- `schemas/`: provisional JSON Schema contracts for target configuration, installation lock, and release manifest.
- `kits/`: **metadata skeletons only**. These directories are not executable bundles.
- `core/`: planned shared safeguards, without runtime code yet.
- `tools/validate_contracts.py`: **formal Draft 2020-12** JSON Schema verification with independent semantic checks.
- `tools/check-contracts.mjs`: supplemental R0 smoke checks; **not** the authority for schema conformance.
- `tests/fixtures/`: positive and negative JSON fixtures for all three contract types.
- `tools/plan_install.py`: R2a **read-only**, deterministic `status` and `plan` using synthetic candidate manifests; see `docs/r2a-planner.md`. It cannot install a kit or attest a GitHub release.
- `tests/`: zero-cost tests for integrity of the R0 scaffolding.
- `examples/`: synthetic, non-installed examples; placeholder identifiers are not real releases.
- `docs/`: ADR, release policy, security boundaries, and development roadmap.

Run `npm run check` with Node.js 22+ and Python 3.12+ with the pinned dependencies in `requirements-contracts.txt` installed. The CI installs them and runs `actionlint` on GitHub Actions workflows. This command does not invoke GitHub Apps, OpenRouter, OpenCode or a paid model.

## Intended future repository-level installation

1. Audit an existing or empty GitHub repository and its actual default branch, rulesets, CI, agents' instructions, and backlog.
2. Select an immutable, published release of a kit, pinned to its verified source commit.
3. Generate an explicit, non-destructive dry-run diff. Never overwrite an existing `AGENTS.md` or CI silently.
4. Open a **draft PR** with the generated kit files and `.asf/agentkit.lock.json`.
5. Verify independent CI on the exact PR SHA and validate manual admin gates separately.
6. Only after separate authorization configure app installations, secrets or rulesets and run a paid pilot.

Merely merging a ruleset JSON file in a PR does **not** apply GitHub Settings.

## Source of truth

Read `AGENTS.md`, `ChatGPT.md`, `docs/adr/0001-catalogue-distribution.md` and the [ASF AgentKit Notion specification](https://app.notion.com/p/40012ac916368112b7fbc8d25dbb9838). Notion is the design reference during R0; this repository, when implemented, will become the versioned source for shipped artifacts. Confirm GitHub state before making any live claim.

## Versioning

Each kit will have independent SemVer releases, identified by namespaced protected tags, verified commit SHAs and a release manifest. Target repositories will lock installed kit versions and managed-file hashes. The current `0.0.0-private-r0` package version identifies **this scaffold only** and is **not** `opencode-openspec@0.0.0` or an installed AgentKit version.
