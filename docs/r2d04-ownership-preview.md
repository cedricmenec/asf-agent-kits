# R2d-04: explicit ownership and overlay preview

**Status: offline preview only. Not an installer, provenance attestor, authority grant or production workflow.** All artifacts remain confined to `.asf/agentkit/` and all operations are read-only. The contract is intentionally conservative, so it may block legitimate upgrades pending explicit human review.

## Example

```sh
python3 tools/render_templates.py --source kits/opencode-openspec/templates --descriptor kits/opencode-openspec/render-preview.json > /tmp/agentkit-render-preview.json
python3 tools/plan_ownership.py --target /path/to/local/repo --preview /tmp/agentkit-render-preview.json --metadata kits/opencode-openspec/candidate-metadata.example.json --policy kits/opencode-openspec/ownership-preview.example.json
```

The optional `--lock /path/to/agentkit.lock.json` loads an existing, separately supplied lock and validates it with the repository's lock schema. A lock is **not itself an authentication or release provenance proof**. Missing lock or new target files never grant write permission. Synthetic example versions and SHA must never be promoted as a release.

## Conservative ownership contract

The descriptor must contain exactly `schemaVersion:1`, `kitId`, and `managedFiles` with one `{path, overlayPolicy:"preserve-and-block"}` object for **every** rendered file. Paths are unique after case folding, Unicode NFC, and must reside under `.asf/agentkit/`. Path ownership is associated with the descriptor's single `kitId`, not an arbitrary agent-provided free-form principal. The contract forbids automatic overwrites, deletions, path reassignment, and adoption of existing unmanaged files, even if their bytes happen to match the candidate.

The preview checks target files and optional prior lock ownership. Missing previously managed files, local edits, candidate updates, ownership conflicts between kit IDs, case aliases and omitted previously locked files block the plan. A new, missing path is classified `create` and a byte-identical previously locked file `unchanged`. Every other status is `conflict`; the output `status=proposed` is a **dry-run observation only**, not an installation authorization. The output invariably returns `sourceProvenanceVerified=false`, `promotionAllowed=false`, and `writesPerformed=false`.

## Security boundary

This tool does not materialize files, mutate a Git ref, stage a PR, resolve the origin of a GitHub App credential, check a signed release, make a network request, invoke a model, or incur provider charges. Local filesystem inspection is not atomic against symlink swaps, TOCTOU, or concurrent writes; a future R5 writer must use fd-relative no-follow file operations and independently verified source provenance, then submit a draft PR subject to the target repository's actual review and rulesets.
