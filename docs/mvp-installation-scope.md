# ASF AgentKit: installation-first MVP and ASF V3 boundary

**Product decision: 2026-10-24. Status: approved scope, implementation NOT completed.**
This document supersedes the *priority order* in historical R0–R7 plans, not their evidence, tests or security controls. See the [living AgentKit roadmap](https://app.notion.com/p/40112ac91636818dab99de3813963c0c) and the [ASF V3 plan](https://app.notion.com/p/3fc12ac9163680adb3e3e3f63d827f69).

## User-visible outcome

Take the **existing manual** OpenCode+OpenSpec workflow from
[`cedricmenec/threadstep/.github/workflows/agent-openspec.yml`](https://github.com/cedricmenec/threadstep/blob/main/.github/workflows/agent-openspec.yml),
make its *executor* portable, and install one pinned version into a **second** GitHub repository without silently overwriting existing workflows, security policy, backlog or CI.

**Illustrative command contract, not an executable CLI today:**

```sh
asf-agentkit install --repo owner/target --kit opencode-openspec \
  --version X.Y.Z --dry-run
asf-agentkit install --repo owner/target --kit opencode-openspec \
  --version X.Y.Z --pr
asf-agentkit doctor --repo owner/target
asf-agentkit status --repo owner/target
asf-agentkit upgrade --repo owner/target --version X.Y.Z --dry-run
```

A successful MVP demonstrates: generate/install via a draft PR; inspect and manually
complete necessary GitHub App/secret/ruleset settings; dispatch a specific manual
OpenSpec task from ChatGPT through GitHub Actions; receive a branch, PR and independent
CI on the exact SHA; prepare a subsequent version upgrade by PR without losing local
changes. **No ChatGPT direct execution privilege, paid pilot or production activation
is implied by this document.**

## P0 delivery order (GitHub issues)

1. [AK-MVP-01 #88](https://github.com/cedricmenec/asf-agent-kits/issues/88):
   extract the real executor and its **transitive scripts/config dependencies** from
   ThreadStep; make repository, branch, task path, policy, workflow, model allowlist,
   environment variable names, pinned versions and CI names configurable. Exclude
   `workflow_call`/wave-orchestrator logic. A YAML copy without its scripts cannot
   pass acceptance.
2. [AK-MVP-02 #89](https://github.com/cedricmenec/asf-agent-kits/issues/89):
   working local CLI, pinned source, manifest/lock, deterministic byte generation,
   idempotent dry-run, conflict review, real repo checkout and `doctor/status`.
3. [AK-MVP-03 #90](https://github.com/cedricmenec/asf-agent-kits/issues/90):
   controlled GitHub draft-PR publication and read-only setup/permissions diagnostics.
   Never automatically change Apps, secrets or branch rules.
4. [AK-MVP-04 #91](https://github.com/cedricmenec/asf-agent-kits/issues/91):
   a real **second** approved repo; no-pay smoke first; separate owner approval for
   *one* bounded provider run; PR+CI outcome; then non-destructive upgrade by PR.

**Success metric:** count of independently installed/upgradeable working repositories,
not count of synthetic preflight modules or fault cases.

## Minimum technical contracts, not a new framework

- Preserve an immutable source commit SHA and a version lock for each installed kit.
  Treat examples and untrusted release claims as **unverified**. First published
  release must satisfy the appropriate source/tag verification and explicit
  administrative gates; no need to design a new external signing service as an MVP.
- Vendor executable files into the target via a **reviewed PR**. Files that GitHub
  executes necessarily reside under `.github/workflows/`. The current R2d renderer
  confines preview-managed files to `.asf/agentkit/`; **this is not sufficient for
  an operational kit**. Change the contract explicitly, with an exact allowlist,
  independent ownership and collision checks for trusted workflow destinations.
  NEVER bypass the existing R2d guard by writing outside its declared namespace.
- Preserve existing `AGENTS.md`, `.github/`, `.asf/`, backlog, CI and local
  overlays unless an exact, visible conflict-resolution PR is reviewed; no implicit
  deletion or overwrite. A lock file does not itself prove remote source authority.
- Keep the model isolated from writer credentials and protected execution policy.
  Pin runtime dependencies; no unreviewed `latest`. Reuse native GitHub Actions
  job-level concurrency **per target repository**, understanding that it is not
  a cross-repository global mutex. Require explicit owner permission for a paid run
  and never automatically retry a possibly paid or ambiguously completed call.
- A CLI `doctor` may detect missing permissions, Apps, secrets or protections, but
  must not ask the model for secrets, log secret values, grant itself privileges,
  or present a checked-in ruleset as one applied in GitHub Settings.
- `opencode-direct` remains an **optional later** profile. No backlog controller,
  global wave state or ASF V3 `workflow_call` is required for the first kit.

## Classification of preserved work

| Existing AgentKit work | MVP decision | Reason |
| --- | --- | --- |
| R1 contracts; R2a/b/c/d renderer, 3-way preview, manifests, ownership | **Reuse in AK-MVP-01/02** after targeted adjustment | Essential version and safe installation primitives |
| R5a status/SemVer; R5b draft-PR plans; R6a local fixture | **Reuse in AK-MVP-02/03/04** | Installation, diagnostics and upgrade groundwork |
| R3a/R3f OpenSpec policy/phase/checklist/OPSX mock | **Reference and reuse targeted tests only** | Real execution comes from ThreadStep, not synthetic phase success |
| R3g file/Git inventories, R3h-02/03/04 checkpoint/durable-byte/Linux local CAS tests | **Preserve in AgentKit; NON-BLOCKING for MVP** | Useful security regression/qualification; local mutex is not GitHub CAS |
| R3c/R3d/R3e simulated host GitHub identity/permissions | **Reference for AK doctor; audit possible ASF V3 reuse** | Proof cannot be asserted without real installation/transport |
| SEC-02a/b synthetic release checks | **Reuse minimal source checks before actual release, preserve advanced scenarios** | Release trust must be grounded, not self-declared |
| Global wave controller, quotas, ACK/CLAIM, V1/V3 paid-job registry, distributed Git CAS | **ASF V3 only** | Different responsibility: selecting and coordinating *many* tasks |

Every module and test above remains committed on the protected AgentKit `main`;
**no destructive cleanup or automatic code transfer** is part of this decision.
The historical R0–R7 roadmap remains available as implementation evidence, but is
not a blocker list for the first CLI.

## Why not cherry-pick the local CAS into ASF V3 now?

The [ThreadStep V3 canonical draft PR #183](https://github.com/cedricmenec/threadstep/pull/183)
already owns the controller/worker separation and protected Git ref contracts.
The AgentKit R3h `mkdir`/fsync tests prove local Linux fixture behavior, not a
GitHub ref compare-and-swap or a GitHub Actions paid-job mutex. Blindly importing
them would risk introducing a second writer/authority path and a misleading
trust claim. Preserve and **inventory** the evidence in
[ThreadStep issue #196](https://github.com/cedricmenec/threadstep/issues/196).
Create separate, atomic V3 PRs **only** after comparing gaps against the canonical
draft, with no protected-ref mutation, privileged merge or model use without the
separate approvals needed.

## Where to resume

Read `AGENTS.md`, this document, `ChatGPT.md`, `docs/roadmap.md`, the
current GitHub `main` SHA/checks and [Notion AgentKit roadmap](https://app.notion.com/p/40112ac91636818dab99de3813963c0c).
Start at **AK-MVP-01 #88** and ship an installable runnable artifact before new
specialized CAS/cryptographic/concurrency primitives. Tests are always non-paying
unless explicitly authorized. Progress updates must distinguish an actual
installation, a mock and an administrative action.
