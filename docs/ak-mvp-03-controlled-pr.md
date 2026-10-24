# AK-MVP-03: controlled draft installation PR candidate

Status: **review-only candidate; no live target publication has been qualified**.
This implementation follows #88 (merged PR #93) and #89 (merged PR #94).
It introduces no GitHub App or repository permission changes and makes no
paid request. A real target PR is a separate approval/qualification step.

## Explicit two-step workflow

Start with a locally checked out **clean target at the exact approved base
SHA**, a local AgentKit source checkout containing the pinned development
commit, and an external config matching that target.

First inspect the deterministic plan, including `planSha256` and every
managed file SHA-256:

```sh
python3 bin/asf-agentkit install \
  --repo owner/target-repository \
  --checkout /path/to/clean/target \
  --kit opencode-openspec --version 0.1.0 \
  --source /path/to/asf-agent-kits \
  --source-commit EXACT_AGENTKIT_SOURCE_COMMIT_40_HEX \
  --config /path/to/reviewed-target-config.json --dry-run
```

Only after separately confirming the **target repository, default branch,
base HEAD SHA, source commit, destination paths, config and plan digest**, an
operator can request a new draft PR:

```sh
python3 bin/asf-agentkit install \
  --repo owner/target-repository \
  --checkout /path/to/clean/target \
  --kit opencode-openspec --version 0.1.0 \
  --source /path/to/asf-agent-kits \
  --source-commit EXACT_AGENTKIT_SOURCE_COMMIT_40_HEX \
  --config /path/to/reviewed-target-config.json \
  --pr --base-branch main --expected-base-sha EXACT_TARGET_HEAD_40_HEX \
  --new-branch asf-agentkit/install-first-review \
  --expected-plan-sha EXACT_DRY_RUN_SHA256_64_HEX \
  --expected-app-id EXPECTED_APP_ID
```

The second command requires an externally obtained short-lived **GitHub App
JWT** in `GITHUB_APP_JWT` (or another explicitly named environment variable
via `--github-app-jwt-env`). Never write the JWT or private key to the config,
lock, CLI arguments, PR, task or model context. The CLI does not generate JWTs
from private keys or install Apps. Its audited JWT transport observes the
target repository's App installation, confirms the exact expected App ID and
existing `Contents:write`/`Pull requests:write` permissions, then mints a
one-repository installation token limited to those permissions. An independent
GET checks that token is scoped to exactly the target repository.

## One-way publication and denial boundaries

- The target local checkout remains **read-only**. A fresh, ordinary
  `asf-agentkit/install-*` branch is created via GitHub Git Data API; the
  configured default branch and existing remote branches are never updated.
- Local dry-run, exact source Git objects, config and **managed file byte
  hashes** must match the approved plan digest. Dirty checkout, wrong origin,
  mismatched base SHA, unmanaged/overlaid paths and non-create operations are
  denied before any remote write.
- The authenticated preflight checks repository identity, default branch,
  token repository scope, App grants, exact base HEAD, absent proposed branch,
  absent matching open PR, and a complete recursive Git tree with no managed
  path, case alias, symlink or parent collision. HTTP 403, 404 in unexpected
  places, incomplete observations and errors refuse closed.
- Git blobs/tree/commit are created **only after** successful preflight. A
  second exact-base check precedes creation of the new ref, and its resulting
  SHA is read back; a third exact-base check precedes the **draft** PR.
- Creating a ref or PR is not a multi-endpoint GitHub transaction. If an API
  call fails after ref creation, the CLI **does not delete, retry or overwrite**
  anything automatically. Inspect the remote branch and PR before deciding
  whether manual recovery is safe.
- The returned `draft-pr-created` status leaves CI as
  `pending-independent-exact-sha-validation`. No auto-merge, release, model
  call or production activation follows. No repository ruleset, secret or
  GitHub App permission is modified by the CLI.

## Qualification and outstanding gates

Offline HTTP fixtures cover successful draft creation, missing/invalid token
authority, wrong App ID, incomplete token repository scope, permission denial,
403 errors, moved base/ref, duplicate branch/PR, case and symlink collisions,
plan digest mismatch, and a partial write requiring human inspection. These
fixtures **do not constitute a real authenticated GitHub qualification**.

Before a real second-repository installation in #91, the owner must separately
approve that exact target write and any App installation/permission or
secret/ruleset setup required. Verify CI on the **exact published PR SHA**,
perform an independent human review of the generated workflow and provenance,
and explicitly authorize any future paid pilot and sensitive merge. A
development commit pinned by SHA is not an attested release or protected tag.
