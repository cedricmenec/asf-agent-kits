# R3g-01: local fixture byte inventory (non-paying)

This is a read-only, host-selected disposable directory inventory, not an installer or trusted provenance verifier. It verifies the filesystem's real bytes and compares paths against an explicit allowlist. Files are hashed using SHA-256, and the output can be passed to R3f-03 mock sync guards. Unknown files, links, executables, hardlinks, missing paths, malformed input, case aliases and ordinary file mutations fail closed.

The HEAD SHA is an **asserted fixture label**, not verified against a Git repository. The test harness writes only to temporary directories, cleans up, and never invokes OpenCode, OpenSpec, OPSX, GitHub, network, credentials or a paid provider. A privileged concurrent filesystem adversary can still race a pathname lookup: the current pre/post stat checks are not a secure openat-style sandbox. Do not point this helper at a real target repository or treat its output as permission to write, merge, execute or pay.

Run `node --test tests/local-fixture-inventory.test.mjs` and the independent GitHub CI on the exact PR SHA. Later R3g milestones must qualify stronger filesystem isolation, real Git SHA and lock provenance, overlay conflict handling and archive completeness separately.
