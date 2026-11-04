# Run a task

Start with plan if you want to review the spec before the agent writes code.

## 1. Write a small task

Store a task such as backlog/tasks/`TS-009.md` on the default branch. Use your configured directory and prefix. The runtime accepts task numbers 1-999 or an ID such as TS-009.

Include the goal, scope, expected behavior, testable acceptance conditions and anything the agent must preserve.

Example task:

```markdown
# TS-009: Explain an empty result
Goal: Show a clear message when a search returns no results.
Scope: Search results view and its product tests.
Expected behavior: An empty search shows "No results found".
Acceptance:
- The message appears only for an empty result.
- Existing results still render.
- Automated tests cover both cases.
Do not change workflows, dependencies or authentication.
```

Put project context in openspec/config.yaml. Keep human acceptance work separate from the executable checkboxes in OpenSpec `tasks.md`.

## 2. Start the workflow

In your target repository, open Actions → AgentKit OpenSpec (manual, staged or auto) → Run workflow. Choose the configured default branch.

Set task\_id to TS-009, phase to plan and model to one of the listed models. Launching the run can incur provider charges. The owner must make that choice.

## 3. Review the plan

A successful plan creates branch agent/openspec/TS-009 and a draft PR. Read `proposal.md`, `design.md`, specs/\<capability>/`spec.md` and `tasks.md` under openspec/changes/ts-009/.

Check that the spec matches the task, scope is clear, acceptance scenarios are observable and implementation checkboxes can be verified automatically. Keep the plan on the work branch for the next step. Apply resumes this branch.

## 4. Implement

Start a new dispatch for the same task with phase apply. You may select a different allowed model for this separate run. Apply uses the existing plan branch, writes code and tests, updates `tasks.md` and updates the same PR.

The workflow runs the project's checks and OpenSpec validation. Independent PR CI then checks the published commit. Review the actual diff and CI for that commit.

## 5. Sync specs when ready

Finalize checks the implementation checklist and project tests, uses OPSX sync to update shared specs, then archives the change. Review the synced specs and archive in the PR. It does not merge the PR.

If you use this staged flow, finish the desired phases before merging the work branch. Finalize still needs the active change and plan branch.

## Auto option

Auto performs plan → apply → spec sync/archive in one run, with checks and stop-on-error behavior. It has no human approval pause between phases and uses one selected model throughout.

Auto and plan require the task branch to be absent. If it already exists, inspect it and use apply or finalize only when the existing state supports that phase.

## After a failure

Do not click Re-run jobs for a paid run: attempts after the first are refused. Inspect logs, provider usage and remote branch/PR state. A fresh manual dispatch is a new cost decision; it is not guaranteed to resume automatically.

Do not submit several tasks at once. The concurrency guide explains why the execution gate is not a task queue.

## Continue

[Troubleshooting](troubleshooting.md) · [Architecture](architecture.md) · [Documentation index](../../README.md)
