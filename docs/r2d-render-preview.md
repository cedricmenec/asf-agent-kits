# R2d-01: confined deterministic template preview

**Scope: offline and read-only.** This first renderer resolves real, UTF-8 source templates into deterministic, hashed output *in memory*. It neither writes target files nor produces an installable release. Inputs may be untrusted: `sourceProvenanceVerified=false`, `writesPerformed=false`; no execution, promotion, GitHub credentials, App changes, or paid model calls.

## Example

```sh
python3 tools/render_templates.py --source kits/opencode-openspec/templates --descriptor kits/opencode-openspec/render-preview.json
```

The output is canonical JSON (sorted keys and file paths, stable Base64 contents and SHA-256 hashes). A descriptor declares exactly `schemaVersion: 1`, `kitId`, `targetRepository` and `files` pairs of `template` and `path`. Only `{{KIT_ID}}` and `{{TARGET_REPOSITORY}}` substitutions are supported; unknown or malformed placeholders fail closed. A rendered candidate is **not** a verified release manifest, lock or installation.

All target paths must remain under `.asf/agentkit/`. Parent traversal, absolute paths, backslashes, Unicode non-NFC, Git internals, duplicate/case-colliding targets, symlinked source roots/components, binary or CRLF sources and oversized output are rejected. Limits: 250 files, 1 MiB per template/output, 10 MiB aggregate, 64 KiB descriptor. No output file is written, and no existing target file can be overwritten. Source inspection is a read-only preview and is **not atomic against hostile concurrent filesystem mutation**. A later apply implementation requires fd-relative no-follow operations, trusted provenance and non-destructive PR review.

R2d follow-ups: attest the template source to an immutable catalogue commit, expand a reviewed ownership map beyond the confined namespace, bridge rendered files to R2c manifests and R2b merge previews, then implement a separate safe PR-based application path. No execution or production workflow is introduced by this change.
