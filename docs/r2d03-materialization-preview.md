# R2d-03: target materialization preview, read-only

**Prototype only.** This is not an installer, trusted release, lock, PR publisher or an execution authorization. It operates on a local target filesystem and emits a deterministic, conservative JSON plan **without writes**. No GitHub API call or model invocation occurs.

## Usage

```sh
python3 tools/render_templates.py --source kits/opencode-openspec/templates --descriptor kits/opencode-openspec/render-preview.json > /tmp/render-preview.json
python3 tools/plan_rendered_preview.py --target /path/to/local/target --preview /tmp/render-preview.json --metadata kits/opencode-openspec/candidate-metadata.example.json
```

Metadata example is deliberately synthetic: fake version numbers and a zero source SHA **cannot be published as a release**. The preview independently validates the R2d-01 payload through R2d-02's official release schema and recomputed artifact checksums. Its flags remain `writesPerformed=false`, `sourceProvenanceVerified=false`, `promotionAllowed=false`. `status=proposed` only means no blocking local collisions were *observed*, never that an install is approved.

Output operations: `create` if a path is absent, `unchanged` if existing content is byte-identical, and `conflict` for divergent existing content. A `conflict` means `status=blocked` and CLI exit code 2. Root/path symlinks, special files, non-directory parents and case alias collisions fail closed (exit 3). All rendered destinations are restricted to `.asf/agentkit/`; no arbitrary CI, AGENTS.md or lock paths.

This filesystem scan **does not guarantee atomicity**. A malicious concurrent actor could swap a path between check and use. Any future apply must have trusted source provenance, explicit review of ownership and overlays, file-descriptor-relative no-follow writing, correct locking/CAS and a GitHub draft PR instead of uncontrolled target changes. See security gates R3e and SEC-02b/c.
