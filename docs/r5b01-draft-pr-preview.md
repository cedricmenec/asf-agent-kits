# R5b-01: advisory draft-PR envelope, no branch/PR publication

The function `preview_draft_pr(manifest, ownership, transition=None)` in `tools/preview_draft_pr.py` composes a **pure, untrusted** representation of future AgentKit installation or upgrade changes. It has no filesystem, network, Git CLI or GitHub API calls and cannot open a branch or pull request.

## Inputs and safeguards

- A syntactically valid but **unattested** release manifest for one kit, with a complete commit SHA, namespaced tag and artifact digests. Only canonical `.asf/agentkit/` managed paths are accepted, matching R2d-04/R5a-03. Source data can be forged and never becomes provenance.
- An exact-shape R2d-04 ownership preview, rejecting missing/extra fields, false conflict counts and assertions of provenance/promotion/writes. Candidate artifact paths must all be included. For initial installation every non-conflicting file must be new, never silently adopted from pre-existing unmanaged content.
- Optional exact-shape R5a-02 version transition for upgrade. The kit, candidate version, source commit and full set of path operations must match the release and ownership plan. An update of an already-managed file requires the R2d conflict gate; a removal must remain a blocking conflict. No source verification or resolved conflict is inferred.

The result exposes a **preview title only**, paths, declared SHA-256s, proposed file actions and either `review-preview-only` or `blocked`. It never emits source or target contents and does not generate an actual PR body, commit, Git ref or editable lock. No output can authorize execution, merge, release, installation or payment: `githubPrCreated=false`, `sourceProvenanceVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`.

## Tests and remaining work

Run `python3 -m unittest discover -s tests -p test_draft_pr_preview.py` (then the full non-paying CI suite with actionlint). Negative fixtures cover unexpected ownership, false authority fields, mismatched candidate commit/version, removal, ownership conflict, case collisions, protected paths, unexpected extra files and attempted silent overwrite. These are **logic checks on untrusted inputs**, not an integration test against an authenticated GitHub host.

R5b-02 must separately implement authenticated source/release verification, a host-owned immutable target SHA, independently assessed contents/permissions, safe staging/rollback and a draft PR via an authorized publication principal. R3e-03, SEC-02 and R6 are mandatory gates, none satisfied by this preview. Never run against a real target with this module or treat `review-preview-only` as permission to write. No paid LLM, privileged App, tag or release is used.
