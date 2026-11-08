# Troubleshooting

Read the failed step and inspect the branch and PR before trying again. A failed run may already have incurred provider cost.

| Symptom | What to check | Next action |
| --- | --- | --- |
| Workflow skipped at prepare | Actor, default branch and run attempt | Use the personal repository owner on the configured default branch, first attempt |
| Organization admin cannot run | Actor is compared with organization owner name | Review and adapt the actor policy before organization use |
| Task not found | Prefix, number, directory and default-branch task file | Commit the correct task and use its ID |
| Model refused | Selected value and installed allowlist | Choose a listed model; adding one needs a policy update |
| Missing setup | APP\_ID and both secret names | Complete setup in GitHub Settings |
| `ASF-PREFLIGHT`, `ASF-APP-ACCESS` | Required task files, project lock/config, app installation, `contents`/PR write scope | Fix the reported prerequisite and dispatch again; no model was started |
| `ASF-BUDGET-AMOUNT/KEY-LIMIT/UNAVAILABLE` | `repair_calls` and `budget_usd`, non-resetting provider key cap, remaining allowance, API response | Set both inputs to 0 to disable repair, or configure a dedicated capped key and an authorized envelope. Do not print the key |
| `ASF-PREAPPLY-GATE` or `ASF-OPSX-*` | Draft checkpoint SHA, proposal/design/delta specs/tasks, checklist line, strict validator and target tests | Fix the plan safely on the draft branch and dispatch `apply`, or enable a single budgeted repair in a fresh plan/auto run when no plan branch exists. Do not bypass the gate |
| `ASF-STALE-SHA`, `ASF-STALE-BRANCH`, `ASF-DEFAULT-MOVED` | Published checkpoint SHA and branch tip, default commit and concurrent dispatches | Inspect the remote refs and dispatch the correct next phase; do not force-push |
| Scope rejected before checkpoint | Forbidden path, binary/large plan file or recognizable credential | Remove unsafe content in a reviewed correction; no remote checkpoint is published |
| Existing agent branch | Previous plan or partial work | Inspect it; use apply/finalize if valid; do not delete useful work blindly |
| Existing change directory | Previous plan output | Review state; plan/auto cannot overwrite it |
| Checklist refused (ASF-OPSX-SECTION/MANUAL/MIXED/DEFERRED) | Check the reported `tasks.md` line: a checkbox may include human/visual verification, or PR/CI/sync/archive review | Keep code and deterministic tests as checkboxes; move manual observation to `## Manual acceptance` and PR/CI/sync review to `## Post-sync review`, both without checkboxes |
| Forbidden path | Generated changes to protected or unsupported paths | Review the diff and narrow the task; do not weaken guards to force publication |
| Branch moved | Default or agent branch changed after prepare | Inspect both refs and restart deliberately from the correct state |
| Project checks failed | Tests and product environment | Read the failure; fix the cause before resuming |
| Local CLI refuses file operations | Native Windows, symlink, hardlink or path collision | Use Linux/WSL2 and a regular clean checkout |
| Portable CLI rejects path or file | Existing symlink/junction, hardlink, special file, unsafe path, collision or modified file | Use a clean isolated checkout; do not bypass guards or force an overwrite |
| Install or upgrade blocked | Existing unmanaged files or changed managed files | Preserve edits and resolve the conflict in a reviewed branch |
| Doctor says unknown | Missing access or no remote read requested | Check GitHub Settings manually; unknown is not a successful check |
| PR absent after failed run | Execute/publish logs, work branch, provider usage | Establish what actually finished before another dispatch |

## Gather a useful report

Record task ID, phase, selected model, run URL, failed job/step, source commit, work branch and PR URL. Include safe error text. Do not include keys, tokens or full environment dumps.

A model timeout or network error may leave provider billing uncertain. Check the provider dashboard as well as GitHub.

## Repair carefully

Keep useful branches and logs until you understand the failure. Do not force-push protected branches, disable CI or bypass scope checks to recover. The kit has no universal resume button.

The checklist error reports a rule code, line number and safe correction instructions, not the original task content. The proposed checkpoint workflow publishes a plan after the scope and credential-pattern guard but *before* strict plan validation. Thus an invalid plan remains inspectable in a draft PR while `apply` is blocked. Do not mistake the checkpoint for a passing gate. The optional repair is **one** extra model invocation under a provider-bound budget envelope, not a general autonomous recovery loop. These updates are proposed by [issue #127](https://github.com/cedricmenec/asf-agent-kits/issues/127) and are not retroactively included in published 1.4.0.

## Continue

[Reference](reference.md) · [Run a task](use.md) · [Documentation index](../../README.md)
