# Releases and evidence

**Release target: 1.5.1.** Before installing a version, verify that its GitHub
release is actually published and immutable, with a matching pinned source SHA
and manifest. The latest published release is 1.5.0; 1.5.1 is being prepared.

1.4.0 included the private
GitHub read-authentication fix (#118) and portable Node.js CLI fix (#119).
Use the immutable GitHub tag, verify the complete pinned source SHA and
release-manifest SHA-256, and review the residual TOCTOU threat model before
installing or upgrading.

## 1.5.1 (prepared; not yet published)

- Fixes a GitHub Actions status-condition edge case that could silently skip
  `publish_apply` after the successful `execute_apply` job when an optional
  ancestor was skipped. All four OpenSpec publication jobs now check their
  required direct dependencies explicitly while bypassing the implicit
  success condition inherited from skipped ancestors.
- Adds regression coverage for the rendered workflow. The fix does not alter
  paid model usage, permissions, or credential isolation.
- No live qualification of the fixed publication path is claimed. Qualify the
  workflow on a test repository before relying on it in production.
- Planned immutable tag: `kits/opencode-openspec/v1.5.1`. Its exact source
  commit SHA and manifest digest will be recorded after the version-bump PR is
  merged and the read-only release-evidence workflow completes.

[Prepared release notes](RELEASE_NOTES_1.5.1.md) · [PR #132, fix](https://github.com/cedricmenec/asf-agent-kits/pull/132)

### Publication procedure for 1.5.1

1. Merge the dedicated version-bump PR after its non-paying CI passes. Do not
   create the tag from the unmerged PR SHA.
2. The read-only **Prepare OpenSpec release manifest (non-paying)** workflow
   starts on the version bump to `main`. If needed, dispatch it manually on
   `main`. Confirm its run SHA is the exact intended release source commit.
3. Download its `opencode-openspec-release-evidence-<SHA>` artifact. It contains
   `release-manifest.json`, `release-manifest.sha256` and
   `RELEASE_NOTES_1.5.1.md`. Verify the manifest's `sourceCommitSha`,
   `kitVersion`, `releaseTag`, paths and checksum. No LLM is called.
4. Create the annotated tag `kits/opencode-openspec/v1.5.1` **at that exact
   commit**. Prefer creating the tag with `git tag -a` using the verified
   source SHA, then pushing only that tag; do not use a moving branch as proof
   of identity.
5. On [GitHub's new release form](https://github.com/cedricmenec/asf-agent-kits/releases/new),
   select the existing tag, title it `ASF AgentKit OpenCode + OpenSpec 1.5.1`,
   paste the prepared notes and attach **all three files** from the artifact.
   Mark it as the latest stable release, not a prerelease. Save a draft first,
   review its tag and assets, then publish. Immutable releases cannot later
   replace missing or incorrect assets.
6. Check the published release tag, manifest and source SHA. Installation or
   upgrading of business repositories is a separate reviewed operation.

## 1.5.0 (published, immutable)

- Includes the durable plan checkpoint, blocking pre-apply gate and optional
  bounded plan repair described in [the 1.5.0 release notes](RELEASE_NOTES_1.5.0.md).
- Tag: `kits/opencode-openspec/v1.5.0`, pointing to source commit
  `97d6d453c8097b3d4b2b205d42c4568a013f2c2d`.
- Release-evidence workflow: [run #42525946739](https://github.com/cedricmenec/asf-agent-kits/actions/runs/42525946739).
- [Published immutable release](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.5.0).

## 1.4.0 (published, immutable)

- **Private Git repositories:** authenticated read-only ref checks through the
  scoped GitHub Actions token; ASF Flow App remains the isolated writer of draft PRs (#118).
- **Portable Node.js CLI:** no Linux `/proc/self/fd`, Python or Go requirement
  for install/status/doctor/upgrade; qualified on Linux, macOS and Windows (#119).
- **Security boundary changed:** the portable pathname-based CLI rejects
  unsafe paths and existing links but accepts residual TOCTOU risk if an
  adversary can change parent directories concurrently. Use a trusted isolated
  checkout, not a hostile multi-tenant workspace.
- Tag: `kits/opencode-openspec/v1.4.0`, pointing to source commit
  `4f9a31f94888f20a2df7b4335ec7c0f5a70d869d`.
- The published GitHub release is immutable and includes `release-manifest.json`,
  `release-manifest.sha256` and release notes.
- The 43-artifact manifest SHA-256 is
  `7003f50e11163ef362f1fab886aa56d8fe11b2a4d7f2b3957c66467cf64e1b50`.
- The release source is independently tested by catalogue CI and validated
  through non-paying installation and upgrade qualifications on temporary
  Git checkouts from one private and one public consumer repository.
  No paid OpenCode execution is implied by these tests.

[Published release](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.4.0) · [Risk matrix](limits.md#local-filesystem-security-and-residual-toctou-risk-node-cli-140) · [Manifest generation evidence](https://github.com/cedricmenec/asf-agent-kits/actions/runs/42497408174)

## 1.3.0 (published)

- Published OpenCode/OpenSpec kit release with the Node.js catalogue and
  OpenCode Direct co-installation capability.
- **Linux/WSL2 with accessible `/proc/self/fd` required** for CLI managed
  filesystem writes. No native macOS/Windows or procfs-free compatibility
  was claimed by this release.
- Tag: `kits/opencode-openspec/v1.3.0`.
- For the exact source SHA and release asset digest, consult the
  [published immutable release](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.3.0).

## 1.2.0

- Tag: kits/opencode-openspec/v1.2.0
- Source commit and exact manifest digest: see the immutable GitHub release.
- Node.js 26.13.0 LTS replaces Python for every catalogue tool and the local CLI.
- Executor templates also pin Node 26.13.0; npm rejects runtimes outside >=26.13.0 <27.
- Install/upgrade plans, managed-file hashes, overlays and rollback protections are retained.
- Linux/WSL2 with accessible procfs directory descriptors remains required for safe writes.
- Qualification: catalogue PR #110 (1,420 tests, actionlint, rendered kit), target PR #5 (actual upgrade, repeat, rollback and overlay refusal). No paid model was run for this migration.

[Published release](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.2.0) · [Upgrade guide](update.md)

## 1.1.0

- Tag: kits/opencode-openspec/v1.1.0
- Source commit: 3ed348621cff28dc0b6be1503fce2a17bbc0f1e3
- GitHub release: published, stable and marked immutable
- Manifest asset: release-manifest.json
- Manifest SHA-256: 3dfd94b0ab5c1299e1174aa6fa485bc317603dc031d575b6ad2c8c14e489e706

[Published release](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.1.0)

This release adds sequential auto mode while keeping plan, apply and finalize. It removes the paid\_approval input. The owner still chooses phase and model through a manual dispatch. Auto has no dollar cap.

The release itself does not prove that every phase has been exercised on a real project.

## 1.0.0

First stable source-pinned release. Retained as historical release information. New installations should use the latest published compatible version after validating its source and risk model.

[Published release 1.0.0](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.0.0)

## What was demonstrated

The earlier AQ-009 qualification pilot ran plan and apply, published a draft PR and passed independent project CI on commit 78c368a9f4860e583739a960d6890ba52ed0c8e1.

This pilot used an earlier candidate. It is not evidence that auto/finalize in 1.1.0 completed a new live run. Local installation and upgrade fixtures are useful checks; they do not prove live App identity or publisher authenticity.

## Verify a source

Compare the release page, source commit and attached manifest. Pin the complete source SHA in the install command. The CLI reads those exact Git objects but does not independently authenticate the release publisher.

Use your normal source review and GitHub release controls. The installed lock remains explicitly unattested. Do not treat a matching hash as a cryptographic signature.

## Continue

[Install](install.md) · [Update and rollback](update.md) · [Documentation index](../../README.md)
