# Releases and evidence

The last published OpenSpec kit is 1.3.0. Its Node.js installer requires Linux
with accessible procfs. Check the immutable source and the release manifest
before any installation or upgrade. A portable Node-only successor is under
qualification, **not yet published**.

## Proposed 1.4.0 (NOT PUBLISHED)

**Why 1.4.0 instead of 1.3.1:** the installer removes its Linux-only fd-relative
filesystem security boundary in favor of a portable Node.js implementation.
This is a meaningful, user-visible change in supported environments **and**
in the residual security model, not only a bug fix. A minor release, together
with a clear migration note, makes that trade-off visible.

Proposed scope:
- Issue #118: authenticated read-only Git branch checks on private repositories,
  with GitHub App publication credentials still isolated from OpenCode.
- Issue #119: Node-only managed-file I/O without procfs, Go or Python runtime
  requirements; Linux, macOS and Windows fixture qualification.
- Preserve managed-file hash checks, exclusive create, symlink/hardlink refusal,
  collisions, conflict refusal and best-effort rollback.
- **Explicit residual TOCTOU risk:** do not run against a checkout writable
  by a hostile concurrent process. See [risk matrix](limits.md#local-filesystem-security-and-residual-toctou-risk-unreleased-node-cli).

Release gate remains closed until the new version metadata, source SHA,
immutable tag, complete manifest and provenance evidence are prepared and
reviewed on an exact CI-green commit. Do not retag 1.3.0.

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

First stable source-pinned release. Retained as historical release information. New installation instructions target 1.2.0.

[Published release 1.0.0](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.0.0)

## What was demonstrated

The earlier AQ-009 qualification pilot ran plan and apply, published a draft PR and passed independent project CI on commit 78c368a9f4860e583739a960d6890ba52ed0c8e1.

This pilot used an earlier candidate. It is not evidence that auto/finalize in 1.1.0 completed a new live run. Local installation and upgrade fixtures are useful checks; they do not prove live App identity or publisher authenticity.

## Verify a source

Compare the release page, source commit and attached manifest. Pin the complete source SHA in the install command. The CLI reads those exact Git objects but does not independently authenticate the release publisher.

Use your normal source review and GitHub release controls. The installed lock remains explicitly unattested. Do not treat a matching hash as a cryptographic signature.

## Continue

[Install](install.md) · [Update and rollback](update.md) · [Documentation index](../../README.md)
