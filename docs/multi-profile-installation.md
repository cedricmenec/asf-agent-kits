# Multiple profiles per repository (1.3.0)

Install each profile with its own `--kit`, source version and configuration using the existing dry-run, apply or reviewed PR flow. OpenSpec and Direct have separate workflows and runtime directories. All profiles must use the same `mutexGroup` so their paid execution jobs cannot overlap. No paid model is launched by installation.

The first profile retains `.asf/agentkit.lock.json`. Additional profiles use `.asf/agentkit/locks/<kit-id>.json`. Existing locks need no migration. Both install orders are supported. Duplicate locks, identity/path mismatches, unmanaged collisions and local edits fail closed. Do not copy or rename locks manually.

```bash
node bin/asf-agentkit status --repo OWNER/REPO --checkout /path/to/repo
node bin/asf-agentkit status --repo OWNER/REPO --checkout /path/to/repo --kit opencode-direct
node bin/asf-agentkit doctor --repo OWNER/REPO --checkout /path/to/repo --kit opencode-openspec --config /path/to/openspec-config.json
```

Without `--kit`, status and doctor show all installed profiles. With `--kit`, they inspect only that profile. With a single installed profile, the previous report format is preserved. For accurate variable/secret names use doctor with `--kit` and that profile's config. Aggregate doctor checks local prerequisites per profile and does not assume one configuration applies to both.

Upgrade a selected profile with `upgrade --kit ...`, a higher version and the approved dry-run digest. Its own lock and files change; the other profile's version, bytes and overlays remain unchanged. The other workflow must match its lock before a concurrency decision is trusted. Concurrent local installs/upgrades into the same checkout are not supported; use one clean ordinary branch and one reviewed operation at a time.

For a repository with OpenSpec 1.2.0, first upgrade OpenSpec to 1.3.0, then install Direct 0.1.0 from the same reviewed release source. Direct is still an optional development profile; the 1.3.0 OpenSpec release includes its source templates. Use existing GitHub setup only after verifying scope. No additional App permissions, secrets, automatic merge or paid retries are enabled.

Tests cover both orders, idempotence, independent upgrades, overlays, duplicate or forged locks, mutex mismatch and publisher lock selection. Real model execution is not part of this qualification.
