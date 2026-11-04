# Contributing

The public user path is the Node.js CLI plus the OpenCode/OpenSpec workflow templates. The repository also contains older offline research modules. Keep their status clear when changing them.

## Main source locations

- [bin/asf-agentkit](../bin/asf-agentkit) and [tools/asf_agentkit_cli.mjs](../tools/asf_agentkit_cli.mjs): install, status, doctor and upgrade.
- [tools/render_mvp_kit.mjs](../tools/render_mvp_kit.mjs): exact install file allowlist and rendering.
- kits/opencode-openspec/templates/: runtime workflow and guards.
- kits/opencode-openspec/version.json: kit version.
- [tools/build_release_manifest.mjs](../tools/build_release_manifest.mjs): fixed distribution inventory.
- [tools/inspect_release_evidence.mjs](../tools/inspect_release_evidence.mjs): read-only consistency observations.
- core/, tools/plan\_*.mjs and tools/preview\_*.mjs: offline/prototype helpers; not the published executor by themselves.
- tests/: regression and fixture checks.

## Validate a change

Use Node.js 26.13.0 LTS, pinned in .nvmrc and CI. The package supports >=26.13.0 <27; the project .npmrc enables engine-strict so npm rejects incompatible runtimes. Install the pinned npm dependencies, then run the non-paying repository checks.

```bash
npm ci --ignore-scripts
npm run check
```

The catalogue CI also runs workflow linting and rendered-kit qualification. Read .github/workflows/ci.yml for exact current steps. These checks do not run a paid model and do not establish live runtime qualification.

## Preserve boundaries

Keep project-owned instructions, CI and overlays safe during installation. Keep guard scripts based on the trusted dispatch commit. Do not pass publication credentials to the model job.

Update user docs when commands or limits change. Keep historical task progress in repository issues. Keep useful decisions in ADRs and mark proposals as proposals.

The existing ADR is retained as a historical proposal with its original status. Its dated context may differ from the current runtime; it is not the installation guide.

## Releases and prototypes

A local mock, fixture or hash match is not proof of a live GitHub installation, publisher identity or successful model execution. Report each level of evidence accurately.

Use `AGENTS.md` for the repository execution contract. Review release publication, GitHub settings, secrets and paid runs as separate actions.
