# Reference

Use this page for exact names and command options. Follow Install for the full first-use path.

## Configuration

The JSON file must contain exactly these keys. Store it outside the target checkout and keep secret values out of it.

| Key | Meaning | Example |
| --- | --- | --- |
| schemaVersion | Config format | 1 |
| targetRepository | Exact GitHub owner/repository | OWNER/REPO |
| defaultBranch | Branch used for dispatch | main |
| taskPrefix | Uppercase prefix, 2-9 letters/digits, starting with a letter | TS |
| taskDirectory | Relative task directory | backlog/tasks |
| checkScript | npm script name, without npm run | check |
| appIdVar | GitHub variable name | APP\_ID |
| appPrivateKeySecret | GitHub secret name | APP\_PRIVATE\_KEY |
| openRouterSecret | Provider secret name | OPENROUTER\_API\_KEY |
| mutexGroup | Repository execution concurrency group | agentkit-paid-development-v1 |

Changing a config value changes the rendered files. Keep a copy of the exact config used to install the kit.

## Workflow inputs

| Input | Values |
| --- | --- |
| task\_id | 1-999 or configured PREFIX-NNN |
| phase | auto (default), plan, apply, finalize |
| model | One exact model ID below |

Current model IDs:

- openrouter/deepseek/deepseek-v4.1-flash
- openrouter/deepseek/deepseek-v4.1-flash-1017
- openrouter/z-ai/glm-5.3-flash

These are the installed policy values, not a claim about provider availability. OpenAI models are not enabled. Auto uses one model for all phases; separate staged runs can choose different listed models.

## CLI

Run the CLI from the reviewed Node installer checkout with Node.js 26.13.0 LTS.

| Command | Result |
| --- | --- |
| install --dry-run | Show proposed file operations |
| install --apply --expected-head SHA | Create reviewed files locally on an ordinary clean branch |
| status --repo OWNER/REPO --checkout PATH | Compare installed file bytes with lock hashes |
| doctor --repo OWNER/REPO --checkout PATH --config FILE | Check local prerequisites; list manual GitHub setup |
| upgrade --dry-run | Preview a higher version |
| upgrade --apply --expected-head SHA --expected-plan-sha DIGEST | Apply the exact reviewed upgrade locally |

Install and upgrade also require --kit opencode-openspec, --version, --source, --source-commit and --config. Use exactly one action flag.

Exit codes: 0 for a completed command, 2 for a blocked plan, 3 for a refusal/error.

Doctor can make optional GET-only GitHub observations with --github-read --github-token-env GITHUB\_TOKEN and --config. It reads a token from the named environment variable. Do not put the token value on the command line. Missing access or incomplete observations remain unknown.

The advanced install --pr App-JWT path exists in the code, but has not been qualified with a real JWT end to end. Use a normal Git PR for the supported first-use path.

## Installed files

```txt
.github/workflows/asf-agentkit-openspec.yml
.asf/agentkit/runtime/request.mjs
.asf/agentkit/runtime/scope.mjs
.asf/agentkit/runtime/model-policy.mjs
.asf/agentkit/runtime/checklist.mjs
.asf/agentkit/runtime/phase.sh
.asf/agentkit/manual-acceptance.md
.asf/agentkit/openspec-checklist.md
.asf/agentkit/opsx-sync-quality.md
.asf/agentkit.lock.json
```

The nine managed files have hashes in the lock. The lock also records the repository, kit version, source commit and configuration hash. Its trust label is user-pinned-git-object-unattested. A hash match checks local consistency, not publisher identity.

`AGENTS.md`, OpenSpec project config, backlog, product code, product tests and CI remain project-owned. The installer does not generate them.

## OpenSpec output

Plan creates `proposal.md`, `design.md`, `tasks.md` and specs/\<capability>/`spec.md` under openspec/changes/\<lowercase-task-id>/. Finalize updates openspec/specs/ and archives the active change.

Task checkboxes must describe executable implementation work. Put manual acceptance in separate review notes, not in implementation checkboxes.

### Checklist contract and gate

During `plan`, `apply` and `finalize`, the trusted `checklist.mjs` gate rejects tasks that require manual/real-device acceptance, post-sync/PR/CI approval or mixed visual acceptance. Passing `openspec validate --strict` alone does not prove that every checkbox is executable during `apply`.

For example, `- [ ] Implement visually hidden labels with automated DOM assertions` is an executable checkbox. A checkbox that appends `Verify: ... WHEN a user observes ... THEN visually distinguishable` is mixed and is rejected. Keep the implementation/tests checkbox, then put the human observation in `## Manual acceptance` as prose without `[ ]`. Put sync/archive, independent CI and merge review in `## Post-sync review`, also without checkboxes. Observable scenarios can remain in OpenSpec delta specs.

Refusals emit a stable `ASF-OPSX-*` rule code and a `tasks.md` line number with a suggested fix, without echoing model-authored task text. The gate does not automatically rewrite a plan or trigger another model call. In 1.4.0, an invalid plan in `auto` can still stop execution before publication; durable intermediate checkpoints are tracked separately in [issue #127](https://github.com/cedricmenec/asf-agent-kits/issues/127).

## Continue

[Install](install.md) · [Update and rollback](update.md) · [Documentation index](../../README.md)

## Co-installation since 1.3.0

The CLI supports several profiles per repository, with independently owned files and locks. `status` and `doctor` accept optional `--kit`. See [multiple profiles](../../multi-profile-installation.md) for compatibility, shared mutex and upgrade behavior.
