# ADR-0001: multi-kit catalogue and vendored deployment

Status: **proposed for owner review**, R0.

## Context

ThreadStep's manual OpenCode workflows mix reusable capabilities with application conventions. OpenCode is currently installed using `opencode-ai@latest`; source workflows also anticipate ASF V3 `workflow_call`. The initial portable kit must work without ASF V3 and must have a separately verifiable installed version.

## Decision proposal

Create a multi-kit catalogue. Each kit has independent SemVer and can depend on a pinned version of a shared core. Release artifacts and external actions must be bound to verifiable source SHAs. A target repository receives **vendored, managed files** through a reviewed PR with `agentkit.yaml` and `agentkit.lock.json`. No runtime fetch of mutable catalogue code occurs during a paid run. A direct OpenCode kit can be installed separately, but both profiles must share the same cost/security policy when combined.

## Alternatives

1. Reusable remote workflows: useful for later operational centralization but increases remote dependency and cross-repository authorization complexity.
2. Clone mutable `main`/`latest` on every run: rejected because the source can silently change.
3. Copy scripts without manifest and lock: rejected because installed version and drift cannot be proved.

## Consequences

- Changes are propagated via upgrade PRs, not silent live updates.
- Local overlays require a three-way merge and conflict detection.
- A version lock is not proof of deployment unless source commit and managed-file hashes match.
- Executable workflows and security guards must be isolated from LLM mutation.
- No orchestrator V1/V3 is included in the first release.

Owner to confirm the strategy before converting this ADR from proposed to accepted.
