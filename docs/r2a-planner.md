# R2a: deterministic read-only candidate planning and local drift audit

**Status:** prototype, synthetic fixtures only. The catalogue has **no executable, published AgentKit release**. This CLI does not install, upgrade, create PRs, write target files or execute models.

## Commands

```bash
python3 tools/plan_install.py status --target /path/to/target-repository
python3 tools/plan_install.py plan --target /path/to/target-repository --source /path/to/candidate-artifacts --manifest /path/to/release.json
```

`--source` contains artifacts at the paths listed in the candidate **local** release manifest. That manifest must pass the R1 Draft 2020-12 + cross-field checks. The actual artifact bytes are checked against their manifest SHA-256, *not against a live GitHub release*. This does **not** prove the claimed source commit or remote tag.

`status` inspects `.asf/agentkit.lock.json` in the target, refusing malformed lock records and symlinks. It compares each managed file's local SHA-256 to the lock, and reports `hash-match`, `drifted`, `missing`, or `unmanaged-or-legacy`, **always with `provenanceVerified: false`**. A `hash-match` means nothing beyond local hash equality.

`plan` derives sorted `create`, `update`, `unchanged`, or `conflict` operations from the candidate manifest, current local hashes and the existing lock, if any. Existing unmanaged files, drift, missing tracked files, ownership by another kit and candidate omissions are **conflicts** rather than silent overwrites or deletes. Both commands return deterministic JSON sorted by keys and paths.

## Exit codes

- `0`: inspection completed; for `plan`, no blocking conflict.
- `2`: valid plan produced but one or more conflicts block promotion. No writes.
- `3`: invalid/unsafe input, missing or mismatched source artifact, malformed lock, symlink, or another fail-closed error. No writes.

## Safety boundaries and TODO

- Paths reject absolute paths, traversal, ambiguous separators, symlink components and reserved `.git/`; manifests cannot own `.asf/agentkit.lock.json`. Symlink checks are only read-time checks and **not sufficient for write-security under concurrent filesystem mutation (TOCTOU)**. No write operation exists in R2a.
- This tool does not perform a three-way merge or render an actual kit workflow, preserve a managed-file content base, author GitHub PRs, verify a tag/signature against GitHub, or apply rulesets, install Apps, use secrets or call OpenRouter. Those are later, independently gated milestones.
- Tests use temporary synthetic directories and never mutate an actual target repository. The CI job is non-paying, `contents: read` only, and must be validated at the exact SHA before any R2a claim of GitHub qualification.
