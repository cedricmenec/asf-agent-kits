# R0 local qualification evidence

Date: 2026-10-21. Initial execution context: local ChatGPT container, Node.js v22.16.0. **At the time of these local checks the GitHub catalogue had not yet been created.** Remote proof must be obtained independently from the actual pull request.

## Checked locally

- `npm ci --offline --ignore-scripts --no-audit --no-fund`: passed, no external dependency fetched.
- `npm run check`: 3 provisional schema structures loaded, 2 design-only kit descriptors checked, 1 synthetic configuration checked, **10/10 Node built-in tests passed**.
- `node --check` on tools: passed.
- YAML parse of `.github/workflows/ci.yml` with PyYAML: passed, one `check` job recognized.
- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` confirmed via public GitHub tag ref `v4.2.2`.
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` confirmed via public GitHub tag ref `v4.4.0`.

## NOT checked and not implied by the local results

- GitHub-hosted CI against a PR SHA; check the remote run and commit independently.
- actionlint (not installed in the local environment).
- Standards-compliant JSON Schema engine, to be added in R1. The existing checker implements just the schema keywords used by R0.
- OpenSpec, OpenCode, OpenRouter, GitHub App publication, or any paid provider call.
- Hash/source proof for an actual kit release, which does not yet exist.
- GitHub rulesets, branch protection, repository secrets or permissions on a future target.

## Next step

Publish the R0 files through a feature branch and draft PR, run new GitHub CI and verify the exact SHA. Separate authorization is required for rulesets/secrets/app changes.
