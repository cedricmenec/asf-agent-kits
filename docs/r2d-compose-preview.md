# R2d-02: compose a checked but UNVERIFIED release preview

This offline stage bridges R2d-01's deterministic, in-memory rendered files to R2c's release manifest schema. It **does not** verify the template source, claimed commit SHA, release tag, runtime versions or GitHub attestation. It cannot install or release a kit or authorize execution/promotion/payment.

## Pipeline

```sh
python3 tools/render_templates.py --source kits/opencode-openspec/templates --descriptor kits/opencode-openspec/render-preview.json > /tmp/render-preview.json
python3 tools/compose_preview.py --preview /tmp/render-preview.json --metadata kits/opencode-openspec/candidate-metadata.example.json
```

The example metadata intentionally uses placeholder versions and a zero SHA. **Never publish it as a release.** The first command writes only stdout; the shell redirection above creates a local temporary preview file, never an installation path. The second command prints a deterministic JSON envelope containing an `artifacts` manifest conforming to `schemas/release.schema.json`, plus `sourceProvenanceVerified=false`, `promotionAllowed=false`, `writesPerformed=false`.

The composer checks each Base64 byte string, canonical encoding, SHA-256 integrity, UTF-8, forbidden binary/CRLF, paths confined under `.asf/agentkit/`, duplicate/case-colliding targets, file/aggregate size caps, exact key sets and the release metadata contract. For any discrepancy, fail closed. Because all inputs and claimed metadata can be forged, **a hash match alone is not provenance evidence**. SEC-02b/c must independently attest the catalogue release, immutable tag, payload and source SHA before any install/upgrade.

Next: R2d-03 or R5 must design safe, non-destructive materialization only to a reviewed draft PR, with target worktree conflicts, ownership policy, trusted release proof and fd-relative protections against concurrent symlink swaps. Never grant CI from a task or generated manifest.
