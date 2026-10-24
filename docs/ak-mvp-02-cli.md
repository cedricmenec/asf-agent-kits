# AK-MVP-02: local AgentKit CLI candidate, exact Git source

Status: **unreleased and uninstalled outside disposable local fixtures**.
This work is stacked on #93 (AK-MVP-01), and does not authorize any GitHub
App installation, secret change, privileged workflow, model invocation or
remote PR. No operational release or signature provenance is claimed.

## Local invocation

From a pinned, locally checked-out AgentKit repository:

```sh
python3 bin/asf-agentkit install \
  --repo example/qualification-repository \
  --checkout /path/to/ordinary/target-checkout \
  --kit opencode-openspec --version 0.1.0 \
  --source /path/to/asf-agent-kits-checkout \
  --source-commit YOUR_EXACT_40_HEX_COMMIT_SHA \
  --config kits/opencode-openspec/mvp-config.example.json --dry-run
```

The config example must be edited **outside the target checkout** to match its
actual GitHub repository, default branch, backlog path, check script, variable
and secret names, and repository-scoped paid mutex. The CLI always requires
the exact commit, never `latest`, a mutable tag, or a self-declared release.
It reads the nine templates and a version declaration from Git **objects at
that exact commit**, not dirty worktree files. It verifies the configured
AgentKit source remote identity and exact version in the pinned object.

Commands:

- `install --dry-run`: deterministic create/unchanged/update/conflict report
  including the real workflow, with zero target writes.
- `install --apply --expected-head SHA`: local create-only worktree writes on
  an explicitly selected **clean, ordinary non-default branch**. No automatic
  commit, push, PR or privilege change. Existing unmanaged paths, overlays,
  updates and symlinks are refused. Parent directories and leaf files use
  Linux fd-relative `O_NOFOLLOW`/exclusive create with inode-bound rollback.
- `status --repo … --checkout …`: inspect hash drift from the recognized
  local-source lock, never promote the lock into remote provenance proof.
- `doctor --repo … --checkout … [--config …]`: read-only local prerequisites,
  required variable/secret **names**, manual admin steps. GitHub App,
  ruleset and secret presence are explicitly `unknown-not-queried` in this
  first local-only increment.
- `upgrade --dry-run`: compare a higher exact SemVer Git commit with the
  installed lock. It blocks modified overlays, existing unmanaged paths and
  removals. Actual upgrade writes remain a separate, reviewed #90 step.

## Lock and source trust

The CLI writes a strict local-source lock at `.asf/agentkit.lock.json`
(schema version **2**) with the target repo, exact source commit, kit version,
canonical config SHA-256 and every managed file SHA-256. The lock explicitly
records `user-pinned-git-object-unattested`. It is **not** a GitHub release
attestation or approval. The older R0/R2 preview lock schema version 1
assumes release tags; it is deliberately not silently reinterpreted, because
no AgentKit release tag exists yet. An existing v1 lock is refused until an
explicit migration/review is implemented.

In the first commit-based candidate, version `0.1.0` designates a development
source version, not a publicly released artifact. An immutable source commit
is necessary for reproducible bytes but does not itself prove an authorized
publisher or protected release tag.

## Non-paying proof and remaining gates

Disposable local Git fixtures cover installation dry-run, create-only apply,
status, doctor, idempotence, higher-version upgrade preview, overlay collision,
unmanaged collision, case alias, symlink, wrong commit/version, dirty/default
branch, wrong repository remote, unsupported lock, and unchanged pinned blobs
despite local source edits. No remote push, App, OpenRouter, OpenSpec or model.

Before #89 can be marked complete: review the installation semantics and
source trust contract, confirm CI on the exact SHA, and decide how the first
trusted SemVer release is published. #90 then adds **explicit** GitHub draft
PR publication and read-only remote setup diagnostics, with their own
permissions/approval gates. #91 covers a second repository, real OpenSpec
runtime acceptance and an owner-approved paid pilot.
