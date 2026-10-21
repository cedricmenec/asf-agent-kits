# R1: formal contracts and independent workflow checking

Status: **in progress, proposed on a stacked pull request**. Not a release.

## Standards and evidence

- Python `jsonschema==4.26.0`, Draft 2020-12 and its `Draft202012Validator.check_schema` are the authoritative source for R1 contract **structural** validity. Six Python unittest methods cover compilation, positive/negative fixtures and safety checks, with 16 explicit negative fixture files, plus 10 supplemental Node tests retained from R0.
- `tools/validate_contracts.py` enforces separately cross-field invariants (default model allowlist, branch equality, mandatory protected paths, one enabled profile, safe paths, lock id/tag uniqueness and release artifact uniqueness). Invoke with `python3 tools/validate_contracts.py config examples/valid-config.json`.
- `tools/check-contracts.mjs` and its mini-evaluator are retained as optional R0 smoke checks. **They are not a Draft 2020-12 proof** and are not the source of truth for shipping a release.
- CI installs the explicitly version-pinned Python validation dependencies and Node lockfile, runs `npm run check`, and invokes actionlint upstream commit `03d0035246f3e81f36aed592ffb4bebf33a03106` (tag v1.7.7 checked against GitHub), using pinned `actions/setup-go`.
- All GitHub Actions have `contents: read`, checkout `persist-credentials: false`, and no OpenRouter secrets or usage. Job timeout 12 minutes.

## Further limits

- Go dependencies of actionlint are verified by Go module checksum mechanisms rather than a vendored binary checksum. The actionlint source is committed at a pinned SHA. The CI proof is attached to the PR head SHA once its run finishes.
- The first release is **not authorized** by a schema pass alone. Actual producer/consumer hashing, lock provenance, symlink/file-system containment, conflict-free upgrades, identity gates, real runtime credentials isolation, and protected-branch audit remain later milestones.
- These JSON examples are synthetic and do not authorize any paid model run. A ruleset file merged via PR is not applied to GitHub Settings.
