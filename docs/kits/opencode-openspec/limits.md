# Limits, isolation and costs

Use one task at a time, review the spec and PR, and control provider spending. Remote execution reduces exposure of your local machine; it does not make arbitrary code safe.

## Main limits

| Area | Current behavior |
| --- | --- |
| Work unit | One existing backlog task per manual dispatch |
| Parallel work | Execute jobs share a configured repository concurrency group |
| Queue | No backlog scheduler or task-wave queue |
| Models | Three fixed OpenRouter entries; no OpenAI entry |
| Auto | Sequential plan, apply and spec sync; no human pause |
| Recovery | Manual inspection and new dispatch when appropriate |
| Merge | Draft PR only; no automatic merge |
| Project support | Current runtime expects a Node/npm project with a lockfile |
| Setup | App, secrets and effective GitHub protections require manual setup |
| Release trust | Lock hashes detect local drift; they do not authenticate the publisher |

## One task at a time: precise meaning

Only the execute job is inside the concurrency group. Prepare and publish are outside it. With cancel-in-progress false, a running execution is not cancelled by a new one.

GitHub concurrency is not a reliable queue for many tasks; pending runs may be replaced. It is scoped to one repository and group, not a global budget lock. Do not use overlapping dispatches as a scheduler. Wait for the full run and review its result before starting another task.

## Remote isolation

OpenCode runs on a GitHub-hosted Ubuntu runner, away from your workstation. The model execution job has read-only GitHub permissions and no App publishing token. Publishing happens in another job after patch checks.

The model job still has a provider key and network access. Generated code, tests and dependencies can execute within that job. Path checks happen after agent execution and are not a process sandbox or network filter. Logs, artifacts and provider traffic must be treated accordingly.

## Costs

Auto starts up to three OpenCode phase invocations. Each can make several API requests, so this is not a three-request billing cap. The execute job has a 60-minute timeout, not a dollar limit. GitHub compute may also consume your Actions allowance or incur charges.

No automatic paid retry is implemented. Re-running an existing attempt is refused; a new manual dispatch may start new paid work.

## Scope restrictions

Plan can change only its OpenSpec change directory. Apply protects the reviewed proposal, design and delta specs; it can update the task checklist and allowed product paths. Workflows, agent runtime, project context and several sensitive file types are protected. Product deletions are generally refused by the current guard.

Finalization may update shared specs and move the active change to an archive. The exact rules live in scope.mjs. A passing scope check is a file rule check, not a full security assessment.

## Proof limits

The recorded AQ-009 pilot demonstrated plan, apply, a draft PR and independent CI. It did not prove every stack, organization use, full auto/finalize behavior or independent use by a new developer. Validate the flow on your own project before relying on it.

## Continue

[GitHub setup](github-setup.md) · [Troubleshooting](troubleshooting.md) · [Documentation index](../../README.md)
