# Update and rollback

Update through a clean branch and normal PR. Keep local edits safe and read the dry-run before applying.

## Before updating

Read the release notes, check the new source commit and preserve your current lock and configuration in Git. Use a dedicated, isolated checkout on Linux, macOS or Windows, stop overlapping writes and start with a clean working tree.

Release 1.2.0 removes Python and requires Node 26.13.0 LTS (supported range >=26.13.0 <27). Align the product package engines, root lockfile engines, .nvmrc, .npmrc (engine-strict=true) and project CI before checking the upgrade. Dependencies and product scripts need no version changes. Auto retains the 1.1.0 behavior: up to three agent phases, with no dollar cap.

Use the reviewed Node installer checkout from Install and run `npm ci --ignore-scripts` there before calling the CLI. The examples below use the published immutable 1.5.0 source. Verify its tag and manifest before use. The CLI can read historical release Git objects without executing their old installer.

## Preview and apply

Use the same workspace layout as the install guide. Replace the values for your repository and paths. The command below targets the published release 1.5.0 from an older installed version.

```bash
REPOSITORY="OWNER/REPO"
SOURCE="/absolute/path/to/agent-kits"
TARGET="/absolute/path/to/target-repo"
CONFIG="/absolute/path/to/agentkit-config.json"
git -C "$SOURCE" fetch origin tag kits/opencode-openspec/v1.5.0
SOURCE_SHA="$(git -C "$SOURCE" rev-parse 'kits/opencode-openspec/v1.5.0^{commit}')"
# Verify SHA and manifest against the published release before running code.
git -C "$SOURCE" switch --detach "$SOURCE_SHA"
npm --prefix "$SOURCE" ci --ignore-scripts

git -C "$TARGET" switch -c chore/upgrade-agentkit-1.5.0
BASE_SHA="$(git -C "$TARGET" rev-parse HEAD)"
kit_upgrade() {
  node "$SOURCE/bin/asf-agentkit" upgrade \
    --repo "$REPOSITORY" --checkout "$TARGET" \
    --kit opencode-openspec --version 1.5.0 \
    --source "$SOURCE" --source-commit "$SOURCE_SHA" \
    --config "$CONFIG" "$@"
}
kit_upgrade --dry-run
```

Read every operation and conflict. Copy planSha256 from this exact report. Then apply only if the plan is correct:

```bash
PLAN_SHA="COPY_THE_REVIEWED_planSha256_VALUE"
kit_upgrade --apply --expected-head "$BASE_SHA" --expected-plan-sha "$PLAN_SHA"
node "$SOURCE/bin/asf-agentkit" status --repo "$REPOSITORY" --checkout "$TARGET"
node "$SOURCE/bin/asf-agentkit" doctor --repo "$REPOSITORY" --checkout "$TARGET" --config "$CONFIG"
git -C "$TARGET" diff --check
git -C "$TARGET" diff
```

Run the project checks, review the managed-file and lock changes, then commit and open a PR. The command makes no commit or push and starts no model.

## Portable CLI security model in 1.4.0

For the Node-only 1.4.0 CLI, **stop all concurrent writers** to the
target checkout before `install` or `upgrade`, and work on a dedicated
branch in an isolated workspace. Existing links, hardlinks, collisions,
unexpected managed content or unexpected Git state are rejected. Temporary
replacement and rollback are best effort, not a crash-proof transaction.

**Residual TOCTOU:** a hostile process able to replace a parent directory
after the CLI checks it and before the write may redirect a file operation
outside the checkout. The portable Node path-based approach does not offer the
atomic directory-handle guarantees of the 1.3.0 Linux implementation.
Do not rely on it in multi-tenant or adversarial shared workspaces.
Read the [risk matrix](limits.md#local-filesystem-security-and-residual-toctou-risk-node-cli-140).

## Conflicts

Modified managed files, unmanaged collisions and unsupported removals can block an upgrade. Preserve local changes and compare them with the old source and new source. Do not delete the lock or force an overwrite to skip the conflict.

The CLI checks the reviewed plan digest and base commit. It does not support concurrent writers to the same local checkout.

## Rollback

Before merge, inspect the branch diff and any partial result before discarding work. If apply fails, the CLI attempts local rollback of its own unchanged writes. A crash or outside edit can require manual repair.

After merge, use a reviewed Git revert PR that restores the previous managed files and lock together. Run the project CI. Reverting files does not remove GitHub secrets, App access or settings; review those separately if needed.

## Continue

[Releases and evidence](releases.md) · [Troubleshooting](troubleshooting.md) · [Documentation index](../../README.md)
