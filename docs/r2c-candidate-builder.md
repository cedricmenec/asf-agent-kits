# R2c — deterministic local manifest builder

**Status: read-only prototype. NOT a release, attestor, installer or source of authorization.** No GitHub API calls, model invocations, writes or runtime activation.

## Command

    python3 tools/build_candidate.py --source /path/to/local/artifacts --descriptor /path/to/descriptor.json > candidate.json
    python3 tools/build_candidate.py --source /path/to/local/artifacts --descriptor /path/to/descriptor.json --verify-manifest candidate.json > /dev/null

The JSON descriptor contains exactly the release metadata fields (all fields from schemas/release.schema.json except artifacts) plus paths, a non-empty array of relative artifact file paths. Fields include schemaVersion, kitId, kitVersion, coreVersion, sourceRepository, sourceCommitSha (40 lowercase hex), releaseTag and pinned runtime versions. A supplied SHA/tag is UNVERIFIED caller metadata.

The resulting JSON is byte-deterministic (sorted keys and paths, canonical separators, one LF terminator), includes SHA-256 of each local artifact, and passes formal Draft 2020-12 release schema and semantic checks. Path ordering in the descriptor does not affect the result. --verify-manifest re-hashes files and checks the candidate against a local manifest; it does NOT verify upstream provenance.

## Fail-closed security controls

- Reject missing, symlink, non-regular, changing or oversized source files and unsafe/symlinked parent paths.
- Reject absolute/traversal/ambiguous, non-NFC, Git internal or installer-owned paths; duplicate and case-colliding paths; unknown/duplicate descriptor keys or invalid schema.
- Maximum 250 paths, 1 MiB per file, 10 MiB total; canonical JSON is sent to stdout only.
- No local tag verification, source authenticity, release promotion, writes to any target, GitHub ref modification, signing, secrets, OpenCode execution or paid calls.
- Existing kits are still design-only, without installable runtime artifacts.

Future work: deterministic kit templates and ownership, protected tag rules, GitHub provenance verification, separately approved installation PR and privileged gates.

Tracking: https://github.com/cedricmenec/asf-agent-kits/issues/7 and https://github.com/cedricmenec/asf-agent-kits/issues/9
