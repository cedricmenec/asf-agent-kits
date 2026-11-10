# Install

Install the kit through a normal branch and PR. Plan for setup: this release has no complete one-line installer.

Use Git, Node.js 26.13.0 LTS and npm. The published 1.4.0 CLI runs on
Linux, macOS and Windows without needing procfs, Python or Go. The examples
below use Bash, available in Git Bash on Windows. Verify the published release
and immutable source SHA before installing; never install an unreleased candidate
as if it were a published release.

## Portability and trust boundary in 1.4.0

**Immutable 1.3.0 still requires Linux with accessible `/proc/self/fd`.**
The published Node.js 1.4.0 release removes that requirement and does not need
Python, Go or precompiled helpers. Linux, macOS and Windows qualification
passed at the reviewed source commit. Do not attribute these improvements to
release 1.3.0.

The portable CLI assumes a trusted local Git checkout with no hostile process
modifying its directories concurrently. It detects existing symlinks/junctions,
hardlinks and unsafe paths, checks managed-file hashes and uses exclusive file
creation and best-effort rollback. **It does not guarantee immunity to TOCTOU
attacks**: an attacker able to replace a parent directory between inspection
and an operation could redirect a write outside the checkout. Use an isolated
workspace and do not run untrusted processes at the same time. For shared or
hostile environments, stronger native directory-handle isolation is required.
See [Limits, isolation and costs](limits.md).

## Before you start

Your target repository needs an initial commit, an application, package.json, package-lock.json, a working npm check script, OpenSpec context at openspec/config.yaml and a backlog task directory. It also needs its own PR CI. The kit installs none of these product files.

Keep the target checkout clean. Use your normal Git access to publish the install PR. You do not need a GitHub App token for local installation.

## 1. Get the published source

Run from a workspace directory. Replace OWNER/REPO with your repository. If you already have a target checkout, use it instead of cloning it again.

```bash
REPOSITORY="OWNER/REPO"
git clone https://github.com/cedricmenec/asf-agent-kits.git agent-kits
git -C agent-kits fetch origin tag kits/opencode-openspec/v1.5.0
SOURCE_SHA="$(git -C agent-kits rev-parse 'kits/opencode-openspec/v1.5.0^{commit}')"
git -C agent-kits switch --detach "$SOURCE_SHA"
git clone "https://github.com/$REPOSITORY.git" target-repo
SOURCE="$(pwd)/agent-kits"
TARGET="$(pwd)/target-repo"
CONFIG="$(pwd)/agentkit-config.json"
cp "$SOURCE/kits/opencode-openspec/mvp-config.example.json" "$CONFIG"
```

The commands above use the published 1.5.0 release. Compare its full source SHA
and release-manifest.json digest with the GitHub Release before continuing. Do
not use a release-preparation branch as if it were a published version. The CLI
reads Git objects at the chosen exact commit; it does not authenticate the publisher.

## Prepare the Node installer

The detached checkout is both the Node installer and the source of the templates. All installation commands below use its exact commit SHA.

```bash
node --version
npm --prefix "$SOURCE" ci --ignore-scripts
```

No global install is required. The Node CLI reads the exact source Git objects and never executes scripts from the selected historical source. Python is not required.

## 2. Set your project values

Edit agentkit-config.json outside the target checkout. Change targetRepository to OWNER/REPO and set the branch, task prefix, task directory and check script for your project. Keep secret names here, never secret values. The configuration reference explains every field.

The example uses taskPrefix TS, taskDirectory backlog/tasks, checkScript check and defaultBranch main.

## 3. Preview the install

Keep using the same Bash session so the variables remain available.

```bash
git -C "$TARGET" status --short
git -C "$TARGET" switch -c chore/install-agentkit-1.5.0
BASE_SHA="$(git -C "$TARGET" rev-parse HEAD)"
kit_install() {
  node "$SOURCE/bin/asf-agentkit" install \
    --repo "$REPOSITORY" --checkout "$TARGET" \
    --kit opencode-openspec --version 1.5.0 \
    --source "$SOURCE" --source-commit "$SOURCE_SHA" \
    --config "$CONFIG" "$@"
}
kit_install --dry-run
```

Read the full report. A fresh install creates 12 managed OpenSpec files plus one lock file. Stop if the report shows a conflict or an unexpected path. Existing product files must stay intact.

## 4. Apply the reviewed plan locally

```bash
kit_install --apply --expected-head "$BASE_SHA"
node "$SOURCE/bin/asf-agentkit" status --repo "$REPOSITORY" --checkout "$TARGET"
node "$SOURCE/bin/asf-agentkit" doctor --repo "$REPOSITORY" --checkout "$TARGET" --config "$CONFIG"
git -C "$TARGET" diff --check
git -C "$TARGET" status --short
```

Status should report hash-match for the managed files. Doctor reports local prerequisites and the names of required secrets. Its default result does not verify GitHub settings.

Run your target project's check command. Review the installed files, including untracked files, then commit them on this branch, push it and open a normal draft PR. Review CI and merge the installation through your normal review process.

## 5. Configure execution

Before running an agent, configure the GitHub App, variable, secrets and branch protection described in the setup guide. Installation itself does not call a model.

## Done when

The workflow is on the default branch, managed hashes match, the product checks work and the GitHub setup is complete. You can then launch your first small task.

## Continue

[GitHub setup](github-setup.md) · [Reference](reference.md) · [Documentation index](../../README.md)
