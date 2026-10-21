# R2b: experimental three-way read-only preview

**Status: draft PR, prototype only. NOT an installable kit, not an approved candidate release.**

## Usage (offline, synthetic local candidate)

First installation: `python3 tools/plan_merge.py --target /tmp/target --new-source /tmp/candidate --new-manifest /tmp/candidate-release.json`

Upgrade from a prior locked version: `python3 tools/plan_merge.py --target /tmp/target --base-source /tmp/old-artifacts --base-manifest /tmp/old-release.json --new-source /tmp/candidate --new-manifest /tmp/candidate-release.json`

Both commands only read source and target and emit deterministic JSON. They never mutate the destination or call OpenRouter, OpenCode, GitHub Apps or GitHub Settings. Plan entries are proposed create, update, unchanged, preserve-overlay or blocking conflict; they include hypothetical SHA-256s but **not content bodies or a ready-to-apply patch**.

Target `.asf/agentkit.yaml` is parsed with pinned PyYAML using a strict SafeLoader; duplicate mapping keys, anchors, aliases, YAML merges, multi-documents, custom tags and schema-invalid config are rejected. Candidate manifest passes Draft 2020-12 validation and each artifact's local SHA-256 must match. For upgrades, the old manifest must match the lock's ID, version, tag, source SHA and managed file hashes.

Managed UTF-8 LF files may be merged only when text hunks are disjoint. Overlapping edits, same-anchor insertions, symlinks, path traversal, protected paths, ownership clashes, implicit deletion, binary or CRLF three-way edits produce conflicts. A fast-path for exact byte-equality does not imply approval to apply a large/binary change, since **promotionAllowed is always false**.

**Security limitations:** this is not a repository provenance verifier. `sourceProvenanceVerified=false`, `promotionAllowed=false`, `writesPerformed=false` in every successful plan. The hashes verify local consistency only; source commit/tag are supplied by the caller, not checked against a trusted GitHub tag. Policy is read from the target and is not a trusted protected-ref policy. No TOCTOU-safe writer exists. Do not use this tool to install agents or perform privileged operations.

## Tests and follow-up

`npm run check` exercises all Python test_*.py suites, Node tests and R1 schemas. The GitHub CI also runs pinned actionlint. Verify that the PR check refers to the exact head SHA before claiming remote qualification.

Next milestones: protected-policy loading, verified source provenance, deterministic release/template rendering, robust overlay semantics, non-destructive installer PR, security integration tests and separately approved administrative gates. This PR intentionally leaves all of these open.

Reference: https://github.com/cedricmenec/asf-agent-kits/issues/7