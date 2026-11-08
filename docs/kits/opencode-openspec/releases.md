# Releases and evidence

**1.4.0 is the latest published OpenSpec kit release**, with the private
GitHub read-authentication fix (#118) and portable Node.js CLI fix (#119).
Use the immutable GitHub tag, verify the complete pinned source SHA and
release-manifest SHA-256, and review the residual TOCTOU threat model before
installing or upgrading.

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
