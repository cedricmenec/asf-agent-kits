# ASF Agent Kits

## Current product priority: installable AgentKit MVP (24 Oct 2026)

**Installation-first decision:** [MVP scope and reuse matrix](docs/mvp-installation-scope.md) is the **active delivery plan**, while the offline R0–R7 catalogue below is retained as historical technical evidence. Implement [AK-MVP-01 #88](https://github.com/cedricmenec/asf-agent-kits/issues/88) (extract the runnable manual OpenCode+OpenSpec executor from ThreadStep), then [CLI #89](https://github.com/cedricmenec/asf-agent-kits/issues/89), [GitHub PR/setup #90](https://github.com/cedricmenec/asf-agent-kits/issues/90), and [second-repository E2E and version upgrade #91](https://github.com/cedricmenec/asf-agent-kits/issues/91). **This repository still has no installable kit, CLI, versioned production release, or live deployment.** R3h local CAS/mutex fixtures remain in Git and CI but **are not MVP blockers**. ASF V3 controller/waves/global CAS belong to [ThreadStep's own backlog](https://github.com/cedricmenec/threadstep/issues/196); no cherry-pick or second CAS writer. Protected workflows, Apps, secrets, payments and releases need separately verified permissions and owner approvals.

**Status (24 Oct 2026): offline R0/R1/R2a–R2d, R3a–R3e-02, R3f-01–04 and R3g-01–05 prototypes integrated on `main`; SEC-02a and SEC-02b-01 synthetic release checks, plus R5a-01/02/03, R5b-01 and R5b-02a read-only install/upgrade/PR publication previews and R3h-01/02/03/04 and R6a-01 offline handoff, versioned checkpoint-journal, disposable byte qualification and private Linux local CAS/lock fixtures integrated. NOT an installable, independently authenticated, attestable or released kit. Verify the latest refs/PRs/CI before relying on this dated status.**

This repository is intended to publish independently versioned, portable, manually-triggered agent kits for GitHub repositories. Initially it specifies:

- `opencode-openspec`: the standard OpenCode + OpenSpec profile, with manual `plan`, `apply`, `auto`, and `finalize` phases (not yet implemented in R0).
- `opencode-direct`: an optional independent OpenCode profile, disabled by default (not yet implemented in R0).

The executable shared core, trusted release publication, installer, upgrade/rollback application and agent workflows are **future milestones**. Read-only contract validation, drift planning, three-way preview and local candidate manifest generation are prototypes. ASF Backlog Orchestrator V1, ASF Controller V3, waves, global CAS, and automatic paid retries are excluded from this initial distribution.

## Current development contents

**AK-MVP-01 #88 / draft PR #93:** A real manual OpenCode+OpenSpec template
candidate is now renderable and smoke-testable without payment using
[`tools/render_mvp_kit.py`](tools/render_mvp_kit.py) and
[the extraction audit](docs/ak-mvp-01-extraction.md). This is not a trusted
release, installation, activated workflow or live GitHub/App qualification.
The local installer and doctor CLI still belong to #89.

**AK-MVP-02 #89 candidate (stacked development branch):** a real local
`bin/asf-agentkit` entry point now supports exact-commit Git source rendering,
`install --dry-run`, explicit create-only branch apply, local `status`,
`doctor` and `upgrade --dry-run`. See
[CLI scope, commands and trust limits](docs/ak-mvp-02-cli.md). This remains a
development candidate: no released distribution, remote PR publisher or
effective GitHub admin setup has been qualified.

- `schemas/`: provisional JSON Schema contracts for target configuration, installation lock, and release manifest.
- `kits/`: historical metadata and synthetic examples plus the #88 **unqualified, uninstalled** workflow/runtime templates in `kits/opencode-openspec/templates/`.
- `core/`: consultative manual policy, GitHub read gates and R3e-02 synthetic host preflight; none authenticates a real GitHub App or authorizes execution.
- `tools/validate_contracts.py`: **formal Draft 2020-12** JSON Schema verification with independent semantic checks.
- `tools/check-contracts.mjs`: supplemental R0 smoke checks; **not** the authority for schema conformance.
- `tests/fixtures/`: positive and negative JSON fixtures for all three contract types.
- `tools/plan_install.py`: R2a **read-only**, deterministic `status` and `plan` using synthetic candidate manifests; see `docs/r2a-planner.md`. It cannot install a kit or attest a GitHub release.
- `tools/plan_merge.py`: R2b read-only three-way preview, no apply, source provenance unverified.
- `tools/build_candidate.py`: R2c read-only canonical JSON release-candidate generator with SHA-256 of local selected artifacts, no remote verification; see `docs/r2c-candidate-builder.md`.
- `tools/render_templates.py`, `compose_preview.py`, `plan_rendered_preview.py`, `plan_ownership.py`: R2d-01 to R2d-04 deterministic, non-writing previews. They detect conflicts, but do not prove source authenticity or provide a safe installer.
- `tools/render_mvp_kit.py` and `qualify_mvp_render.py`: #88 destination allowlist (including one workflow), nine runtime/instruction templates, byte/parse checks and mocked non-paying plan/apply/finalize qualification; not a source-verified installer.
- `core/manual-policy.mjs`, `github-gates.mjs`, `github-read-adapter.mjs`, `host-bound-github-gate.mjs`, `synthetic-host-bootstrap.mjs`: consultative/manual gates, restricted GitHub GET and **synthetic** host identity checks. No authenticated runtime credential boundary is implemented.
- `core/openspec-offline-phases.mjs`, `openspec-offline-resume.mjs`, `opsx-offline-guard.mjs`, `openspec-offline-cycle.mjs`: strictly simulated OpenSpec plan/apply/finalize, mock checkpoints, checklist, sync and archive. No real agent execution or OPSX semantic sync.
- `core/local-fixture-inventory.mjs`, `local-fixture-qualification.mjs`, `tools/inventory_fdrelative.py`, `verify_local_git_fixture.py`: disposable local byte/lock/Git object qualification. `tests/r3g05-integrated-recipe.test.mjs` composes these fixtures and R3f, without authenticating a GitHub remote.
- `tools/check_release_claim.py` and `preview_synthetic_release.py`: release claim schema and offline artifact byte consistency against **synthetic** tag and permission observations, not attested GitHub releases.
- `tools/inspect_installation_status.py`: R5a-01 reports `unmanaged-legacy`, `drifted` or `unknown` without ever granting `verified` or source attestation.
- `tools/preview_version_transition.py`: R5a-02/03 strict SemVer upgrade preflight, with R2d's exact `.asf/agentkit/` managed namespace and removal/ownership conflicts; no target writes.
- `tools/preview_draft_pr.py`: R5b-01 purely in-memory advisory draft-PR plan composition, **not** an actual branch/commit/PR publisher.
- `core/manual-phase-handoff-preview.mjs`: R3h-01 pure R3a/R3f manual phase/checkpoint handoff and simulated concurrency gate; no OpenCode or paid runner.
- `core/checkpoint-journal-preview.mjs`: R3h-02 strict JSON journal chain for plan/apply/finalize with replay, SHA and scope refusal; no durable GitHub storage, no authority. See `docs/r3h02-checkpoint-journal.md`.
- `core/disposable-checkpoint-journal-qualification.mjs`: R3h-03 exclusive 0600 journal byte write/read and fault injection **only inside an owned ephemeral Linux temp directory**; no target-repository writes or crash durability guarantee. See `docs/r3h03-disposable-byte-qualification.md`.
- `core/disposable-checkpoint-cas-qualification.mjs`: R3h-04a private Linux filesystem-only CAS fixture, mkdir-exclusive lock, compare/version/digest, fsync+rename, interrupted write and negative tests. PR #84, `docs/r3h04-disposable-local-cas.md`. `tests/r3h04-live-interprocess-lock.test.mjs`: R3h-04b two live processes race for the local lock and check orphan refusal after SIGKILL; PR #85, `docs/r3h04b-live-interprocess-lock.md`. **No authenticated GitHub CAS, no real paid-job mutex or retry.**
- `tools/preview_pr_publication.py`: R5b-02a synthetic target branch/SHA/check/concurrency publication preflight, never a real GitHub PR or authority.
- `tools/qualify_local_installation_fixture.py`: R6a-01 disposable local target check composing read-only R5a/R5b previews and simulated publisher; not globally atomic or authenticated.
- `tests/`: non-paid tests for the catalogue prototypes.
- `examples/`: synthetic, non-installed examples; placeholder identifiers are not real releases.
- `docs/`: ADR, release policy, security boundaries, and development roadmap.

Run `npm run check` with Node.js 22+ and Python 3.12+ with the pinned dependencies in `requirements-contracts.txt` installed. The CI installs them and runs `actionlint` on GitHub Actions workflows. This command does not invoke GitHub Apps, OpenRouter, OpenCode or a paid model.

See [docs/roadmap.md](docs/roadmap.md) for the updated R3f/R3g/R3h (including #77/#79/#84/#85)/SEC-02b/R5a/R5b/R6a evidence and remaining gates. The R5 previews do not grant actual repository installation or publishing authority. R3e-03 real host identity, SEC-02 tag/release provenance, R3 manual runtime, optional R4, safe PR installer R5, qualification R6 and owner-approved activation R7 remain unfinished. Integrating a simulated test cannot make an operational grant true.

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
