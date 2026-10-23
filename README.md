# ASF Agent Kits

**Status: offline prototypes R0/R1/R2a/R2b/R2c/R2d-01 to R2d-04 and consultative R3a to R3e-02 integrated on `main`. NOT an installable, authenticated or released agent kit. Confirm current GitHub status before relying on this summary.**

This repository is intended to publish independently versioned, portable, manually-triggered agent kits for GitHub repositories. Initially it specifies:

- `opencode-openspec`: the standard OpenCode + OpenSpec profile, with manual `plan`, `apply`, `auto`, and `finalize` phases (not yet implemented in R0).
- `opencode-direct`: an optional independent OpenCode profile, disabled by default (not yet implemented in R0).

The executable shared core, trusted release publication, installer, upgrade/rollback application and agent workflows are **future milestones**. Read-only contract validation, drift planning, three-way preview and local candidate manifest generation are prototypes. ASF Backlog Orchestrator V1, ASF Controller V3, waves, global CAS, and automatic paid retries are excluded from this initial distribution.

## Current development contents

- `schemas/`: provisional JSON Schema contracts for target configuration, installation lock, and release manifest.
- `kits/`: **metadata skeletons and synthetic offline examples only**; no executable AgentKit distribution.
- `core/`: consultative manual policy, GitHub read gates and R3e-02 synthetic host preflight; none authenticates a real GitHub App or authorizes execution.
- `tools/validate_contracts.py`: **formal Draft 2020-12** JSON Schema verification with independent semantic checks.
- `tools/check-contracts.mjs`: supplemental R0 smoke checks; **not** the authority for schema conformance.
- `tests/fixtures/`: positive and negative JSON fixtures for all three contract types.
- `tools/plan_install.py`: R2a **read-only**, deterministic `status` and `plan` using synthetic candidate manifests; see `docs/r2a-planner.md`. It cannot install a kit or attest a GitHub release.
- `tools/plan_merge.py`: R2b read-only three-way preview, no apply, source provenance unverified.
- `tools/build_candidate.py`: R2c read-only canonical JSON release-candidate generator with SHA-256 of local selected artifacts, no remote verification; see `docs/r2c-candidate-builder.md`.
- `tools/render_templates.py`, `compose_preview.py`, `plan_rendered_preview.py`, `plan_ownership.py`: R2d-01 to R2d-04 deterministic, non-writing previews. They detect conflicts, but do not prove source authenticity or provide a safe installer.
- `core/manual-policy.mjs`, `github-gates.mjs`, `github-read-adapter.mjs`, `host-bound-github-gate.mjs`, `synthetic-host-bootstrap.mjs`: consultative/manual gates, restricted GitHub GET and **synthetic** host identity checks. No authenticated runtime credential boundary is implemented.
- `tests/`: non-paid tests for the catalogue prototypes.
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

Read `AGENTS.md`, `ChatGPT.md`, `docs/adr/0001-catalogue-distribution.md` and the [ASF AgentKit Notion specification](https://app.notion.com/p/40012ac916368112b7fbc8d25dbb9838). Notion is the design reference; code on protected `main` is the current source for non-operational tooling. Track verified progress in the [living roadmap](https://app.notion.com/p/40112ac91636818dab99de3813963c0c). No installable release, effective installation or authenticated host was verified by these prototypes. Confirm GitHub state before making any live claim.

## Versioning

Each kit will have independent SemVer releases, identified by namespaced protected tags, verified commit SHAs and a release manifest. Target repositories will lock installed kit versions and managed-file hashes. The current `0.0.0-private-r0` package version identifies **this scaffold only** and is **not** `opencode-openspec@0.0.0` or an installed AgentKit version.
