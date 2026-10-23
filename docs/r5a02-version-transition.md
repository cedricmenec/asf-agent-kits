# R5a-02: preview of an untrusted SemVer transition

This is **only** a pure, non-paying, read-only comparison of an installation lock object and a synthetic candidate release manifest. It performs no filesystem I/O, no GitHub calls, no provider/LLM execution, no deployment and no release.

`tools/preview_version_transition.py` uses existing Draft 2020-12 schema validators and additionally requires:
- exactly one installed lock entry for the expected kit, same source repository, a strictly increasing stable SemVer `x.y.z`, a new non-equal candidate commit SHA and an identical core version (core upgrades are a separate review gate);
- complete kit/tag identity, valid managed paths under strict conservative ASCII path rules, no protected/secret files, no path alias, duplicates or collisions with other installed kit ownership;
- a deterministic summary of unchanged, review-update and proposed-create paths. A candidate removal is a **blocking conflict**, never an instruction to delete a target file.

Even a consistent transition is labeled `preview-only`, **not** `verified`, `approved` or `ready-to-install`. Matching artifact digests are claims from synthetic manifests and do not verify any local byte content, source commit, GitHub tag, source provenance or permissions. Its flags always keep `independentlyVerifiedRelease=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false` and `paidApprovalRequired=true`.

Unit tests: `python3 -m unittest discover -s tests -p test_version_transition.py`. The normal CI additionally checks all Python/Node tests and actionlint.

**Remaining gates:** verify the two release versions independently via R3e-03/SEC-02, inspect actual target bytes and conflicts using safe isolated filesystem primitives under R5, propose a draft PR (not a direct write), and qualify install/upgrade/rollback with R6. Version rollback is deliberately unsupported in this preview; the eventual R5 rollback must use its own independently reviewed contract and approval.
