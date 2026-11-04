# OpenCode Direct: scope and safety

OpenCode Direct implements one manually selected backlog task without generating an OpenSpec proposal, apply phase, sync or archive. The owner selects the task and a fixed allowlisted OpenRouter model. The runner installs OpenCode 1.19.0 with Node 26.13.0, calls it once and runs the configured npm check. The task must already exist in the configured directory, with a Node/npm project and lockfile.

The source reference is ThreadStep's `.github/workflows/agent.yml` at commit `abb8b8af14c25322f9155839abc2df8c9eb4b256`. This portable adaptation keeps the small task flow and adds the catalogue's separate prepare, execute and publish jobs. It does not copy ThreadStep's product prompt, branch reuse or auto-merge. The additional catalogue model entry is the same reviewed allowlist as the OpenSpec profile.

| Control | Direct behavior |
| --- | --- |
| Trigger | Repository owner, manual dispatch from configured default branch, first attempt only |
| Model | Fixed allowlist; no automatic paid retries or secondary title model |
| Execution | Read-only GitHub permissions, checkout credentials not persisted, no publishing App token |
| Policies | Loaded from the dispatch SHA before model execution; changed HEAD or branch is refused |
| Concurrency | Configured repository mutex on the execute job, 20-minute timeout, no cancellation |
| Publication | Fresh runner validates the patch against trusted scope before creating an App token |
| Branch | `agent/direct/<TASK-ID>` must be absent; existing branches require human review |
| Output | Ordinary branch and draft PR; independent CI and human review remain required |
| Scope | Product files only; no workflows, runtime, lock, agent policy, task directory, scripts, credentials or OpenSpec changes |

A call may make multiple billable API requests. The timeout is not a spending cap. Explicit authorization for the chosen model is required before each paid dispatch. GitHub Actions compute may also count against your allowance.

The model runner still has a provider key and network access. Scope checks run after execution and are not a process sandbox or a network firewall. The publisher never executes model-controlled package scripts. Independent product CI must run on the exact published PR SHA.

The CLI currently manages one profile per `.asf/agentkit.lock.json`. It refuses replacing an OpenSpec installation with Direct or the reverse. Co-installation and profile migration need a separate reviewed change. The mutex can also match existing workflows when reviewing deployment manually.

## Evidence and remaining gates

Local fake-executable tests exercise the flow without calling a model. Render checks and CI check syntax, scope, source pinning, installation conflicts and OpenSpec regressions. They do not establish live provider behavior, administrative setup or successful end-to-end model execution.

Version 0.1.0 is development-unreleased. No tag, release, secret, App permission, ruleset or target workflow activation is created by preparing the catalogue PR.

## References

- [ThreadStep source](https://github.com/cedricmenec/threadstep/blob/abb8b8af14c25322f9155839abc2df8c9eb4b256/.github/workflows/agent.yml)
- [Implementation issue #112](https://github.com/cedricmenec/asf-agent-kits/issues/112)
- [Install and use](install.md)
