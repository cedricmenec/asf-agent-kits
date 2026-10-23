# R5a-01: read-only installation status classifications

`tools/inspect_installation_status.py` wraps the R2a read-only local lock/file hash comparison on an explicitly selected host directory. It **does not** install, alter, rollback or publish a kit. Its four-state vocabulary is reserved for the eventual R5 installer, but this iteration only returns three states:

- `unmanaged-legacy`: no validated AgentKit lock exists, regardless of whether unrelated files are present;
- `drifted`: a valid existing lock has one or more missing/mismatched managed file hashes;
- `unknown`: the valid lock's managed file hashes match locally, but source provenance and GitHub release attestations are **not** verified;
- `verified` is intentionally **unreachable** until R3e-03 + SEC-02 real independent trust and R6 qualification are implemented. Neither a caller-provided boolean, a simulated tag nor an R2a hash match may grant that classification.

Output excludes file contents, tokens, paths and claimed publisher identity, and always sets `filesystemSnapshotAtomic=false`, `sourceProvenanceVerified=false`, `trustEvidenceIndependentlyVerified=false`, `authorizedToExecute=false`, `promotionAllowed=false`, `writesPerformed=false`, `paidApprovalRequired=true`.

To check a disposable test directory: `python3 tools/inspect_installation_status.py --target <host-selected-temporary-directory>`. Exit 0 for `unknown`/`unmanaged-legacy`, 2 for `drifted`, and 3 on unsafe or invalid input. Run the normal CI suite for regression checks.

**Limitations:** R2a file reads are still pathname-based and not an atomic fd-relative snapshot. Local locks are not independently attested. An ordinary success from this module cannot justify an install PR, release, protected ref write, semantic OPSX execution, GitHub App permission, paid model or production activation. Later R5 must bind independently verified source provenance to an isolated host and safe write primitives.
