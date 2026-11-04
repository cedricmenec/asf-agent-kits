# Releases and evidence

Use release 1.1.0 for new installations. Check the published source and read the limits before running an agent.

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

First stable source-pinned release. Retained as historical release information. New installation instructions target 1.1.0.

[Published release 1.0.0](https://github.com/cedricmenec/asf-agent-kits/releases/tag/kits/opencode-openspec/v1.0.0)

## What was demonstrated

The earlier AQ-009 qualification pilot ran plan and apply, published a draft PR and passed independent project CI on commit 78c368a9f4860e583739a960d6890ba52ed0c8e1.

[Qualification PR](https://github.com/cedricmenec/asf-agentkit-qualification/pull/4) · [Recorded CI run](https://github.com/cedricmenec/asf-agentkit-qualification/actions/runs/40437506108)

This pilot used an earlier candidate. It is not evidence that auto/finalize in 1.1.0 completed a new live run. Local installation and upgrade fixtures are useful checks; they do not prove live App identity or publisher authenticity.

## Verify a source

Compare the release page, source commit and attached manifest. Pin the complete source SHA in the install command. The CLI reads those exact Git objects but does not independently authenticate the release publisher.

Use your normal source review and GitHub release controls. The installed lock remains explicitly unattested. Do not treat a matching hash as a cryptographic signature.

## Continue

[Install](install.md) · [Update and rollback](update.md) · [Documentation index](../../README.md)
