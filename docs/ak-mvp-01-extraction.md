# AK-MVP-01: manual OpenCode/OpenSpec executor extraction

Status: **real renderable templates, not installed, executed, released or paid-tested**.
Source audit: `cedricmenec/threadstep` main on 24 October 2026,
`.github/workflows/agent-openspec.yml`.

## Dependency and ownership matrix

| ThreadStep component | Portable handling | Why |
| --- | --- | --- |
| `workflow_dispatch`, `normalize-task-id.mjs` | Workflow + `request.mjs` | Configurable task ID, path, branch, target default ref |
| `agent-openspec-checkpoint.mjs` | `scope.mjs` from trusted base | No writer token in model; protected path/extension checks |
| `opencode-model-policy.mjs` | `model-policy.mjs` | Fixed allowlist, no secondary title-model charge |
| `check-openspec-task-phases.mjs` | `checklist.mjs` + instructions | Fail-closed recognized human/post-sync checkboxes |
| `sync-guard.mjs`, OPSX generated commands | Trusted `phase.sh` plus phase-specific patch scope | Strict validation, archive; runtime simulation is not proof |
| `docs/factory/openspec-checklist-contract.md` | `openspec-checklist.md` | Human and post-sync checks stay narrative |
| `backlog/tasks/TS-NNN.md`, `openspec/config.yaml`, npm test | Target prerequisites | Never copy ThreadStep product context |
| App variables and OpenRouter credentials | Parameterized names | Presence checked, values never printed |
| Checkout/Node/OpenSpec/OpenCode/App-token/artifacts | Pinned actions and runtime versions | No `latest` executables |
| `workflow_call`, waves, global paid mutex, auto-merge | Excluded | No ASF V3 orchestration or automatic merge |

## Rendering and ownership

`tools/render_mvp_kit.py` accepts `mvp-config.example.json`, validates its
fields, reads exactly nine templates and outputs base64 bytes and SHA-256
hashes for fixed destinations. It does **not** write to any target.

The sole workflow destination is `.github/workflows/asf-agentkit-openspec.yml`.
All other destinations reside under `.asf/agentkit/`. This is a new, explicit
allowlist for the MVP, **not** a relaxation or bypass of the historical R2d
preview's `.asf/agentkit/` boundary.

Command (read-only):

```sh
python3 tools/render_mvp_kit.py \
  --config kits/opencode-openspec/mvp-config.example.json
```

The preview is an **unverified local-source candidate**, not an installed,
attested or released version. AK-MVP-02 will verify an immutable catalogue
source commit, generate a lock and plan against the actual target checkout,
refusing existing unmanaged files, symlinks and case collisions.

The workflow separates a read-only `prepare` gate, one explicitly authorized
paid `execute` phase without a writer credential, and a separate `publish`
job that validates a patch and the exact observed refs before obtaining an
App token. Draft PR only, no automatic merge, no ASF V3 runtime.

## Qualification limits

The target needs a reviewed `package-lock.json`, `package.json` with the
configured check script, `openspec/config.yaml`, a backlog task, GitHub App
configuration and an independent protected CI. No such setup is performed here.

- Locally validate the rendered YAML with actionlint and exercise all non-paying
  scopes and negative request cases.
- A disposable Git fixture now exercises plan/apply/finalize and scoped
  modifications with **mock OpenSpec/OpenCode/npm binaries**, proving the
  phase plumbing without a model/network call. This is not real OPSX or
  GitHub App qualification; those integration gates remain open.
- AK-MVP-02 supplies source verification, lock, collisions and real checkout
  installation; AK-MVP-03 controls remote PR publication and read-only setup.
- AK-MVP-04 requires separate owner authorization for a second repository,
  secrets/permissions/protection and the single paid pilot.

Passing unit tests is not proof of operational App permissions, OpenSpec
semantics, financial controls, actual deployment or provider execution.
