# Install and run OpenCode Direct

Use Node 26.13.0 and an authorized local checkout of the catalogue and target repository. This is a development profile, not a published release. Choose a reviewed full catalogue commit containing Direct 0.1.0, then install dependencies with `npm ci --ignore-scripts` in the catalogue.

Copy `kits/opencode-direct/mvp-config.example.json` to a local configuration file. Set the target repository, default branch, task prefix and directory, existing npm check script, App variable/secret names and repository mutex. Names are configuration; never put secret values in the file. Preserve existing repository CI, instructions and application files.

Create an ordinary installation branch in the target checkout, then preview from the catalogue directory. Replace the example paths, repository and SHA with your actual values:

```bash
node bin/asf-agentkit install \
  --repo OWNER/REPO --checkout /path/to/target \
  --kit opencode-direct --version 0.1.0 \
  --source /path/to/asf-agent-kits --source-commit FULL_REVIEWED_COMMIT_SHA \
  --config /path/to/direct-config.json --dry-run
```

Review all six managed files and the lock. Pre-existing unmanaged paths block installation. Another profile may already be installed; its files and lock are preserved. Apply the same command with `--apply --expected-head TARGET_BRANCH_HEAD_SHA` instead of `--dry-run`. Inspect the diff, commit and open an installation PR. The existing `--pr` publisher also supports Direct with its usual approved dry-run digest and scoped App identity; see the [CLI reference](../opencode-openspec/reference.md) for those common options.

```bash
node bin/asf-agentkit status --repo OWNER/REPO --checkout /path/to/target
node bin/asf-agentkit doctor --repo OWNER/REPO --checkout /path/to/target \
  --config /path/to/direct-config.json
```

`doctor` detects the installed profile from its lock. Direct does not require `openspec/config.yaml`. Hash match proves local file consistency, not publisher authenticity or administrative readiness. Upgrade uses the same `--kit opencode-direct` and requires a greater version, an approved plan digest and unchanged managed files.

Before a paid run, independently review the installed `.asf/agentkit/direct/manual-acceptance.md`, App permissions, secrets and default-branch protections. Configuration and activation require separate administrative authorization. The target needs its real `package.json`, lockfile, npm check and backlog task; the installer does not generate an application or fake tests.

After approved installation and setup, the owner opens Actions, selects **AgentKit OpenCode Direct (manual)** on the configured default branch, chooses the existing task ID and approved model, and dispatches only after explicitly authorizing the cost. The result is a draft PR on `agent/direct/<ID>`.

On failure, inspect logs, artifacts and remote refs first. Re-running an attempt is refused. An existing task branch is also refused rather than silently resumed or overwritten. Review or close its PR and decide a separate recovery action; do not trigger a paid retry automatically. A new manual dispatch requires new cost authorization. No automatic merge is implemented.
