# ASF AgentKit OpenCode + OpenSpec 1.5.0

## What's new

- **Durable plan checkpoint:** `plan` publishes a scoped OpenSpec change on an ordinary agent branch and a draft PR before implementation starts. This checkpoint survives a later quality-gate failure.
- **Blocking pre-apply gate:** a separate, non-paying job verifies the *exact published branch SHA* with the OpenSpec checklist contract, required plan artifacts, strict OpenSpec validation and project checks. `apply` cannot start unless verification passes. This applies to staged and `auto` runs.
- **Optional bounded repair:** on an invalid plan, `repair_calls=1` allows at most one additional OpenCode plan-repair invocation and a second checkpoint/verification. This requires an explicit positive `budget_usd` and a provider-side, non-resetting OpenRouter key spending limit. Default is `repair_calls=0`, `budget_usd=0`.
- **Actionable failures:** GitHub Actions summaries and stable error categories explain missing prerequisites, stale refs, quality failures, forbidden paths and budget refusals.

## Safety and compatibility

- GitHub App write credentials remain isolated in preflight/publication jobs; model jobs have read-only GitHub permissions.
- Plan patches are checked for protected paths, binary or oversized content and recognizable credential patterns before publication. These scans are not a complete secret-detection or sandbox guarantee.
- The OpenSpec managed-file inventory grows from 9 to 12 files. Existing installations should use the reviewed Node CLI `upgrade` flow with a dry-run, exact SHA and plan digest; do not overwrite managed files manually. Historical source pins and OpenCode Direct co-installation remain supported.
- A provider-enforced key limit is not a per-invocation atomic reservation: in-flight usage, concurrent calls and provider accounting can still affect charges. Standard plan/apply/finalize model usage remains paid when dispatched.
- No automatic merge, release deployment or privileged ruleset changes are introduced.

## Verification and references

- [OpenSpec quality-checklist fix, PR #128](https://github.com/cedricmenec/asf-agent-kits/pull/128).
- [Checkpoint and budgeted repair, PR #129](https://github.com/cedricmenec/asf-agent-kits/pull/129), [issue #127](https://github.com/cedricmenec/asf-agent-kits/issues/127).
- [Node 26, actionlint and rendered-kit CI](https://github.com/cedricmenec/asf-agent-kits/actions/runs/42524467629) and [portable CLI tests on Linux, macOS and Windows](https://github.com/cedricmenec/asf-agent-kits/actions/runs/42524467630), both passed for the #129 feature SHA.
- Release preparation must pass its own CI on the **final 1.5.0 source SHA**. Attach `release-manifest.json` and `release-manifest.sha256` from that SHA, plus these notes, before publishing an immutable GitHub release.

No paid OpenCode model execution or live end-to-end repair has been performed as part of this release preparation. Validate on a qualification repository before relying on the new behavior in production.
