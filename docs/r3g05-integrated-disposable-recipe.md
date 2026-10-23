# R3g-05: disposable local OpenSpec integration recipe

**Scope: non-paid integration tests only, on newly created disposable local fixtures.** This is neither an installer nor a runtime, GitHub provenance proof, trusted host attestation or release qualification.

## What the recipe proves

`tests/r3g05-integrated-recipe.test.mjs` creates a new temporary local Git repository, commits an explicit set of ordinary files, and obtains its actual `HEAD` with the local Git CLI. It then creates independent `before`, `after` and `archived` copies of a synthetic OpenSpec change. The test invokes `verify_local_git_fixture` (R3g-04) to compare actual committed blob bytes to the `before` snapshot using `inventory_fdrelative` (R3g-03). All three snapshots are also inventoried independently through file-descriptor-relative, no-follow reads.

The resulting byte inventories are consumed by `previewIntegratedOpenSpecCycle` (R3f-04) to check simulated `plan`, `apply`, canonical sync, `--skip-specs` archive and `finalize`. The same temporary trees and pinned Git SHA feed `previewLocalFixtureQualification` (R3g-02), including mock lock and plan/apply checkpoint verification. The recipe checks that Git HEAD, lock, snapshots, canonical paths and counts all agree, while no function grants execution, payment or publication authority.

This test does **not** perform a semantic OPSX synchronization or a genuine GitHub CI observation. It deliberately uses only mock CI objects with a pinned, non-authoritative App ID. Checklist implementation tasks must be checked before `apply`; manual acceptance and post-sync review remain pending and are not silently approved.

## Security regressions covered

Positive run and negative tests for a pending implementation checklist, corrupted checkpoint SHA, divergent lock SHA/bytes, fake check App, attempted paid retry, provider extra output, forged authority field, changed overlay, missing archived file, unmanaged file, symlink, moved local HEAD and tampered committed-file snapshot.

Run on Linux with Git, Python and Node installed: `node --test tests/r3g05-integrated-recipe.test.mjs`. CI additionally runs the normal Python, Node and actionlint checks. The test creates and removes only directories prefixed `asf-r3g05-` inside the system temporary directory. Git commands are local, bounded, non-network commands against the test-generated repository. No credentials, remote, model, provider, protected ref, settings, workflow activation or paid retry is involved.

## Explicitly unproven

A local Git commit does not authenticate a protected GitHub ref, a GitHub App installation, the runner or an immutable release. `O_NOFOLLOW` closes symlink traversal for individual file opens but does **not** provide a globally atomic multi-tree snapshot or establish a trusted initial root. The mock lock and simulated CI remain non-authoritative. No `sourceProvenanceVerified=true`, `authorizedToExecute=true`, `promotionAllowed=true`, `writesPerformed=true`, semantic equivalence claim or paid permission is produced. Actual host identity and permissions belong to R3e-03; provenance and tags belong to SEC-02; atomic installation snapshots and non-destructive application belong to R5/R6.
