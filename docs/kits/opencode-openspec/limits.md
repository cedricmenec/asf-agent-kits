# Limits, isolation and costs

Use one task at a time, review the spec and PR, and control provider spending. Remote execution reduces exposure of your local machine; it does not make arbitrary code safe.

## Main limits

| Area | Current behavior |
| --- | --- |
| Work unit | One existing backlog task per manual dispatch |
| Parallel work | Execute jobs share a configured repository concurrency group |
| Queue | No backlog scheduler or task-wave queue |
| Models | Three fixed OpenRouter entries; no OpenAI entry |
| Auto | Plan checkpoint and strict remote-SHA gate before apply and sync; no human pause after a passing gate |
| Recovery | Manual inspection and new dispatch when appropriate |
| Merge | Draft PR only; no automatic merge |
| Project support | Current runtime expects a Node/npm project with a lockfile |
| Setup | App, secrets and effective GitHub protections require manual setup |
| Release trust | Lock hashes detect local drift; they do not authenticate the publisher |

## Local filesystem security and residual TOCTOU risk (Node CLI 1.4.0)

The **published 1.4.0 Node.js CLI** removes the hard dependency on Linux `/proc/self/fd`.
It uses standard Node.js filesystem operations on a **trusted local checkout**.
This is a deliberate trade-off, not an equivalent security guarantee.

**Still enforced:** safe relative paths, existing parent and leaf symlink/junction
rejection, hardlink/special-file refusal, case-collision checks, bounded stable
reads, managed-file hashes and byte-for-byte preconditions, exclusive new-file
creation, unique temporary replacement, identity checks, and best-effort
rollback. The CLI refuses collisions rather than overwriting unknown files.

**Residual TOCTOU risk:** pathname checks and a later create/rename are not
atomic with respect to changes made by other processes. A hostile process with
write permission to a parent directory could replace that directory with a
symlink/junction **after it was inspected but before the operation**, redirecting
an intended file operation outside the checkout. `O_EXCL` and `O_NOFOLLOW`
(where available) protect the final path component, **not all ancestors**.
Git SHA checks, lock hashes and a Git revert do **not** eliminate this risk,
and rollback might also encounter a redirected path.

| Execution context | Risk / suitability |
| --- | --- |
| Personal workstation, controlled checkout, no hostile concurrent writer | Generally low likelihood; standard CLI threat model |
| Ephemeral isolated sandbox or dedicated GitHub runner | Generally low likelihood if no untrusted concurrent code can edit the checkout |
| Shared workspace, untrusted install scripts, malicious concurrent process | Potentially serious; **do not rely on the Node CLI as a filesystem security boundary** |
| Multi-tenant service executing against attacker-writable directories | Out of scope without stronger OS isolation or native directory-handle-relative operations |

**Compensating controls:** use a dedicated disposable checkout and least-privileged
OS account; do not run untrusted code concurrently; review `--dry-run`,
the full Git diff, and PR CI; keep Git rollback available. Reassess this
risk **before** adopting a shared or adversarial execution environment.

The descriptor-anchored Linux backend from immutable **1.3.0** has different,
stronger guarantees and remains available through that pinned tag. The
portable Node-only approach is **published in 1.4.0**, and is not
included in the 1.3.0 tag.

## One task at a time: precise meaning

Each execution job (plan, optional repair, apply, finalize) is inside the same configured concurrency group. Prepare, verification and publication are outside it. With cancel-in-progress false, a running execution is not cancelled by a new one. Independent dispatches may interleave between phases; each transition verifies its exact expected remote SHA and refuses a stale branch.

GitHub concurrency is not a reliable queue for many tasks; pending runs may be replaced. It is scoped to one repository and group, not a global budget lock. Do not use overlapping dispatches as a scheduler. Wait for the full run and review its result before starting another task.

## Remote isolation

OpenCode runs on a GitHub-hosted Ubuntu runner, away from your workstation. The model execution job has read-only GitHub permissions and no App publishing token. Publishing happens in another job after patch checks.

The model job still has a provider key and network access. Generated code, tests and dependencies can execute within that job. Path checks happen after agent execution and are not a process sandbox or network filter. Logs, artifacts and provider traffic must be treated accordingly.

## Costs

Auto normally starts up to three OpenCode phase invocations. Each can make several API requests, so this is not a three-request billing cap. An optional one-shot repair after a failed plan gate adds **one** more OpenCode invocation, only within an explicitly selected workflow envelope and an independently configured non-resetting OpenRouter key spending cap. Each execution job has a 60-minute timeout, not a dollar limit. GitHub compute may also consume your Actions allowance or incur charges.

The optional repair uses `repair_calls=1` plus a positive `budget_usd` (at most 100 USD). The read-only preflight checks OpenRouter's key status, non-resetting limit and remaining allowance before any model work, and again before the repair. A missing key, unknown limit, resetting cap, management key or remaining cap greater than the requested envelope fails closed. The key should be dedicated to this task. **Provider accounting is not an atomic per-invocation reservation**: concurrent calls, in-flight usage or a provider overshoot may still change actual billing. Treat this as a provider-side spending control, not a transactional hard guarantee. Normal plan/apply/finalize spending remains subject to the owner's dispatch decision and the provider key's limits.

No unbounded paid retry is implemented. The only automatic additional paid invocation is the optional single plan repair inside its prepaid authorization envelope. Re-running an existing attempt is refused; a new manual dispatch may start new paid work.

## Scope restrictions

Plan and repair can change only their OpenSpec change directory. Before publishing them, the guard rejects known credential patterns, binary content and oversized files. This is a best-effort scan, not a guarantee that every sensitive string is detectable. Apply protects the reviewed proposal, design and delta specs; it can update the task checklist and allowed product paths. Workflows, agent runtime, project context and several sensitive file types are protected. Product deletions are generally refused by the current guard.

Finalization may update shared specs and move the active change to an archive. The exact rules live in scope.mjs. A passing scope check is a file rule check, not a full security assessment.

## Proof limits

The recorded AQ-009 pilot demonstrated plan, apply, a draft PR and independent CI. It did not prove every stack, organization use, full auto/finalize behavior or independent use by a new developer. Validate the flow on your own project before relying on it.

## Continue

[GitHub setup](github-setup.md) · [Troubleshooting](troubleshooting.md) · [Documentation index](../../README.md)
