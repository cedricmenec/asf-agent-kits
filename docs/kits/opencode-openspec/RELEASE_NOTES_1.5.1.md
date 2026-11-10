# ASF AgentKit OpenCode + OpenSpec 1.5.1

## What's fixed

- **Apply publication no longer silently skips after optional jobs are skipped.** The four OpenSpec publication jobs now explicitly check the success of their required direct dependencies while using `always()` to avoid GitHub Actions' implicit success condition being inherited from an optional skipped ancestor. This addresses an incident where `execute_apply` succeeded but `publish_apply` did not run, leaving the remote branch without the implementation (PR #132).
- Added rendered-workflow regression coverage to guard the publication conditions against this class of skipped-ancestor failure.

## Safety and compatibility

- The fix does not change paid model execution, concurrency, permissions, credentials, or the separation of GitHub App write tokens from model jobs.
- No automatic merge, release deployment, or privileged workflow activation is introduced.
- Catalogue tests and CI do not prove a live end-to-end execution on a consumer repository. Qualify the published workflow on a test repository before relying on it in production.

## Verification and references

- [Fix and regression coverage, PR #132](https://github.com/cedricmenec/asf-agent-kits/pull/132), addressing [the observed incident](https://github.com/cedricmenec/epargne-famille/actions/runs/42900048619).
- The merged fix passed [R1 Contract & Workflow Checks](https://github.com/cedricmenec/asf-agent-kits/actions/runs/42905728087) on source commit `508c30c7e159eebd7ad2f25a2c15bf4ae4e36728`.
- The release candidate must pass CI on its final merged source SHA. Attach `release-manifest.json`, `release-manifest.sha256`, and these notes from the SHA-bound release-evidence artifact before publishing the immutable GitHub release.

No paid OpenCode execution or live qualification of the fixed publish path is claimed by this release preparation.
