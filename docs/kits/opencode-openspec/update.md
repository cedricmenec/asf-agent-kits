# Update and rollback

Update through a clean branch and normal PR. Keep local edits safe and read the dry-run before applying.

## Before updating

Read the release notes, check the new source commit and preserve your current lock and configuration in Git. Use Linux/WSL2, stop overlapping writes to the checkout and start with a clean working tree.

The current published release is 1.1.0. It adds auto as the default phase. Users upgrading from 1.0.0 must review that new cost behavior: auto can invoke three agent phases, with no dollar cap.

Use the reviewed Node installer checkout from Install and run `npm ci --ignore-scripts` there before calling the CLI. Its source must be a reviewed Node migration commit or a subsequent Node release. The CLI can read historical release Git objects without executing their old installer.

## Preview and apply

Use the same workspace layout as the install guide. Replace the values for your repository and paths. The command below targets release 1.1.0 from an older installed version.

```bash
REPOSITORY="OWNER/REPO"
SOURCE="/absolute/path/to/agent-kits"
TARGET="/absolute/path/to/target-repo"
CONFIG="/absolute/path/to/agentkit-config.json"
SOURCE_SHA="3ed348621cff28dc0b6be1503fce2a17bbc0f1e3"
git -C "$SOURCE" fetch origin

git -C "$TARGET" switch -c chore/upgrade-agentkit-1.1.0
BASE_SHA="$(git -C "$TARGET" rev-parse HEAD)"
kit_upgrade() {
  node "$SOURCE/bin/asf-agentkit" upgrade \
    --repo "$REPOSITORY" --checkout "$TARGET" \
    --kit opencode-openspec --version 1.1.0 \
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

## Conflicts

Modified managed files, unmanaged collisions and unsupported removals can block an upgrade. Preserve local changes and compare them with the old source and new source. Do not delete the lock or force an overwrite to skip the conflict.

The CLI checks the reviewed plan digest and base commit. It does not support concurrent writers to the same local checkout.

## Rollback

Before merge, inspect the branch diff and any partial result before discarding work. If apply fails, the CLI attempts local rollback of its own unchanged writes. A crash or outside edit can require manual repair.

After merge, use a reviewed Git revert PR that restores the previous managed files and lock together. Run the project CI. Reverting files does not remove GitHub secrets, App access or settings; review those separately if needed.

## Continue

[Releases and evidence](releases.md) · [Troubleshooting](troubleshooting.md) · [Documentation index](../../README.md)
