# Contributing

The public user path is the Python CLI plus the OpenCode/OpenSpec workflow templates. The repository also contains older offline research modules. Keep their status clear when changing them.

## Main source locations

- bin/asf-agentkit and tools/asf\_agentkit\_[cli.py](http://cli.py): install, status, doctor and upgrade.
- tools/render\_mvp\_[kit.py](http://kit.py): exact install file allowlist and rendering.
- kits/opencode-openspec/templates/: runtime workflow and guards.
- kits/opencode-openspec/version.json: kit version.
- tools/build\_release\_[manifest.py](http://manifest.py): fixed distribution inventory.
- tools/inspect\_release\_[evidence.py](http://evidence.py): read-only consistency observations.
- core/, tools/plan\_*.py and tools/preview\_*.py: offline/prototype helpers; not the published executor by themselves.
- tests/: regression and fixture checks.

## Validate a change

Use Node.js 22+ and Python 3.12+. Install the pinned contract dependencies, then run the non-paying repository checks.

```bash
python3 -m pip install -r requirements-contracts.txt
npm ci --ignore-scripts
npm run check
```

The catalogue CI also runs workflow linting and rendered-kit qualification. Read .github/workflows/ci.yml for exact current steps. These checks do not run a paid model and do not establish live runtime qualification.

## Preserve boundaries

Keep project-owned instructions, CI and overlays safe during installation. Keep guard scripts based on the trusted dispatch commit. Do not pass publication credentials to the model job.

Update user docs when commands or limits change. Keep historical task progress in issues and Notion. Keep useful decisions in ADRs and mark proposals as proposals.

The existing ADR is retained as a historical proposal with its original status. Its dated context may differ from the current runtime; it is not the installation guide.

## Releases and prototypes

A local mock, fixture or hash match is not proof of a live GitHub installation, publisher identity or successful model execution. Report each level of evidence accurately.

Use `AGENTS.md` for the repository execution contract. Review release publication, GitHub settings, secrets and paid runs as separate actions.
