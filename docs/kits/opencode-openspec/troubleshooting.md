# Troubleshooting

Read the failed step and inspect the branch and PR before trying again. A failed run may already have incurred provider cost.

| Symptom | What to check | Next action |
| --- | --- | --- |
| Workflow skipped at prepare | Actor, default branch and run attempt | Use the personal repository owner on the configured default branch, first attempt |
| Organization admin cannot run | Actor is compared with organization owner name | Review and adapt the actor policy before organization use |
| Task not found | Prefix, number, directory and default-branch task file | Commit the correct task and use its ID |
| Model refused | Selected value and installed allowlist | Choose a listed model; adding one needs a policy update |
| Missing setup | APP\_ID and both secret names | Complete setup in GitHub Settings |
| Existing agent branch | Previous plan or partial work | Inspect it; use apply/finalize if valid; do not delete useful work blindly |
| Existing change directory | Previous plan output | Review state; plan/auto cannot overwrite it |
| Checklist refused | Manual acceptance or post-sync checkboxes | Keep only executable implementation items in `tasks.md`; track human review separately |
| Forbidden path | Generated changes to protected or unsupported paths | Review the diff and narrow the task; do not weaken guards to force publication |
| Branch moved | Default or agent branch changed after prepare | Inspect both refs and restart deliberately from the correct state |
| Project checks failed | Tests and product environment | Read the failure; fix the cause before resuming |
| Local CLI refuses file operations | Native Windows, symlink, hardlink or path collision | Use Linux/WSL2 and a regular clean checkout |
| Install or upgrade blocked | Existing unmanaged files or changed managed files | Preserve edits and resolve the conflict in a reviewed branch |
| Doctor says unknown | Missing access or no remote read requested | Check GitHub Settings manually; unknown is not a successful check |
| PR absent after failed run | Execute/publish logs, work branch, provider usage | Establish what actually finished before another dispatch |

## Gather a useful report

Record task ID, phase, selected model, run URL, failed job/step, source commit, work branch and PR URL. Include safe error text. Do not include keys, tokens or full environment dumps.

A model timeout or network error may leave provider billing uncertain. Check the provider dashboard as well as GitHub.

## Repair carefully

Keep useful branches and logs until you understand the failure. Do not force-push protected branches, disable CI or bypass scope checks to recover. The kit has no universal resume button.

## Continue

[Reference](reference.md) · [Run a task](use.md) · [Documentation index](../../README.md)
