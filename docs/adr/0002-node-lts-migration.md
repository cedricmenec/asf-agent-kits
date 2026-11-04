# ADR-0002: one Node.js LTS runtime for the catalogue

Status: accepted for implementation by the owner on 2026-11-04. Release publication remains a separate decision.

## Decision

Use Node.js 26.13.0 (LTS Lithium, released 2026-10-28) for the installer, contract validation, renderers, release tooling, offline research modules, tests and catalogue CI. Pin the proposed executor workflow to the same version. Node, npm and Git replace the former interpreter, package installer and virtual environment in the local setup. Bash remains the executor phase shell and actionlint remains a CI development tool.

Use ESM modules, exact npm dependency versions and a committed lockfile. Ajv validates Draft 2020-12, ajv-formats provides the format checks, yaml parses configuration with duplicate/alias/anchor/tag rejection, and diff computes conservative text merge hunks.

## Compatibility

Keep CLI commands, codes of exit, lock schema v2, source identity checks and plan hashes. Canonical serialization remains sorted ASCII JSON plus LF. Preserve refusal of overlays, protected branches, unapproved SHAs/digests and untrusted release provenance claims. Read historical source Git objects with the current trusted renderer; never execute code from those source objects.

The new release inventory includes the npm manifests, shared Node modules and schema dependencies. Published 1.0.0 and 1.1.0 tags and assets stay historical immutable objects. These source changes do not publish a new release or upgrade AlphaBinary.

## Safe filesystem design

The local installer supports Linux/WSL2 with accessible procfs. Open the root directory without following links, compare its device/inode, then anchor each child operation through an open directory descriptor using `/proc/self/fd`. Use O_DIRECTORY/O_NOFOLLOW for parents, O_EXCL for creation, O_NONBLOCK and regular-file/hardlink/size checks before reading, and a same-directory temporary file for replacement. Flush content and directory changes. Roll back only matching bytes and inodes created by this invocation. Install remains restricted to a clean ordinary branch with an approved HEAD. Upgrade stages the lock last.

This preserves the existing exclusive-checkout assumption; it is not a multi-process compare-and-swap guarantee. Unsupported hosts fail closed. There is no pathname fallback when descriptor anchoring is unavailable.

## Regression evidence

The original suite ran 316 tests successfully, with one environment-specific skip. Before removal, 627 pure-function cases, 233 filesystem cases and 33 mock GitHub exchange cases were recorded from the previous implementation. The JSON corpora retain inputs and observable outcomes, including denials. No interpreter or legacy executable source is embedded in the test harness. Historic artifact names in fixture data are intentional compatibility inputs.

New node:test suites replay those cases and cover CLI installation, idempotence, upgrade, Git revert, injected replacement failure, symlink/hardlink/FIFO/case conflicts, pinned Git objects, strict JSON and hostile API responses. The existing 451 Node tests remain. Provider substitutes now use Node. Fresh phase-runner regression installs the real esbuild dev dependency on each phase while mocking only provider executables.

Some local execution hosts broker filesystem calls and cannot expose process descriptors. Those descriptor-dependent tests explicitly skip there and fail if the same condition occurs in CI. The Linux GitHub runner must execute every test without skips before this migration is considered validated.

## References

- [Owner plan in Notion](https://app.notion.com/p/40e12ac9163681e39deecfda58c1ad15)
- [Official Node LTS release](https://nodejs.org/en/blog/release/v26.13.0)
