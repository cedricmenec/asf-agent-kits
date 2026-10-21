# Security and financial gates

**R0 is an offline design scaffold. It deliberately contains no OpenRouter action, secrets, deployment workflow, or privileged credential.**

- All installs/upgrades: audit → deterministic dry-run → draft PR → independent non-paid checks → admin gates → separately authorized live pilot.
- Approval is action-specific: expand GitHub App access; set repository secrets; apply rulesets; run a paid model; privileged merge/production activation. No approval is inferred from a Notion note or a PR.
- Store **no secrets** in configuration, manifests, lock files, PRs or model context. A future publisher obtains a short-lived GitHub App installation token scoped only to the target repo, separately from model execution.
- Treat task files, generated code, command fields, symlinks and artifacts as untrusted. Security rules must load from a protected trusted ref and be enforced outside LLM control.
- Future OpenSpec modes `plan`, `apply`, `auto`, `finalize` and semantic `opsx-sync` can entail provider charges. Per-run approval required, no automatic retry and no claimed monetary hard cap without actual provider enforcement.
- `autoMerge` must default false; where explicitly enabled, refuse merge if base/head SHA, required independent CI checks, and actual branch rules are not verified.
- Protect existing CI, `AGENTS.md`, `.github/`, `.asf/` and credentials against writes by generated agent output. The future kit must prove this via negative integration tests.
- GitHub Actions `concurrency` groups are scoped to the repository; they do not implement a cross-repository global budget mutex.
- A ruleset JSON checked into Git is a proposal, not a change to GitHub Settings.
