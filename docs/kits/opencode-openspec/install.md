# Install

Install the kit through a normal branch and PR. Plan for setup: this release has no complete one-line installer.

Use Linux or Ubuntu in WSL2 for the local CLI. Its safe file operations require POSIX features such as O\_NOFOLLOW and O\_DIRECTORY. Native Windows is not supported for those operations. Use Git, Python 3.12+ and Bash. The target runtime uses Node.js 22.

## Before you start

Your target repository needs an initial commit, an application, package.json, package-lock.json, a working npm check script, OpenSpec context at openspec/config.yaml and a backlog task directory. It also needs its own PR CI. The kit installs none of these product files.

Keep the target checkout clean. Use your normal Git access to publish the install PR. You do not need a GitHub App token for local installation.

## 1. Get the published source

Run from a workspace directory. Replace OWNER/REPO with your repository. If you already have a target checkout, use it instead of cloning it again.

```bash
REPOSITORY="OWNER/REPO"
git clone https://github.com/cedricmenec/asf-agent-kits.git agent-kits
git -C agent-kits switch --detach 3ed348621cff28dc0b6be1503fce2a17bbc0f1e3
git clone "https://github.com/$REPOSITORY.git" target-repo
SOURCE="$(pwd)/agent-kits"
TARGET="$(pwd)/target-repo"
CONFIG="$(pwd)/agentkit-config.json"
SOURCE_SHA="3ed348621cff28dc0b6be1503fce2a17bbc0f1e3"
cp "$SOURCE/kits/opencode-openspec/mvp-config.example.json" "$CONFIG"
```

This SHA is the source of release 1.1.0. Check it against the published release before use. The CLI reads Git objects at this commit. It does not authenticate the publisher.

## Prepare the Python environment

The CLI imports the pinned JSON Schema dependency. Create a virtual environment outside the target checkout and install the source requirements:

```bash
python3 -m venv "$SOURCE/../agentkit-venv"
source "$SOURCE/../agentkit-venv/bin/activate"
python3 -m pip install -r "$SOURCE/requirements-contracts.txt"
```

Keep this environment active for all CLI commands in this guide.

## 2. Set your project values

Edit agentkit-config.json outside the target checkout. Change targetRepository to OWNER/REPO and set the branch, task prefix, task directory and check script for your project. Keep secret names here, never secret values. The configuration reference explains every field.

The example uses taskPrefix TS, taskDirectory backlog/tasks, checkScript check and defaultBranch main.

## 3. Preview the install

Keep using the same Bash session so the variables remain available.

```bash
git -C "$TARGET" status --short
git -C "$TARGET" switch -c chore/install-agentkit-1.1.0
BASE_SHA="$(git -C "$TARGET" rev-parse HEAD)"
kit_install() {
  python3 "$SOURCE/bin/asf-agentkit" install \
    --repo "$REPOSITORY" --checkout "$TARGET" \
    --kit opencode-openspec --version 1.1.0 \
    --source "$SOURCE" --source-commit "$SOURCE_SHA" \
    --config "$CONFIG" "$@"
}
kit_install --dry-run
```

Read the full report. A fresh install creates nine kit files plus one lock file. Stop if the report shows a conflict or an unexpected path. Existing product files must stay intact.

## 4. Apply the reviewed plan locally

```bash
kit_install --apply --expected-head "$BASE_SHA"
python3 "$SOURCE/bin/asf-agentkit" status --repo "$REPOSITORY" --checkout "$TARGET"
python3 "$SOURCE/bin/asf-agentkit" doctor --repo "$REPOSITORY" --checkout "$TARGET" --config "$CONFIG"
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
