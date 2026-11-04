import {
  safePath,
  exact,
  object,
  requireThat,
  hash,
  safeRoot,
  strictFile,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
import { compose, MAX_INPUT } from "./compose_preview.mjs";
import { inspect_target } from "./plan_rendered_preview.mjs";
export function canonical_owned(p) {
  safePath(p);
  requireThat(
    p.startsWith(".asf/agentkit/"),
    "Ownership outside confined namespace",
  );
  return p;
}
export function check_policy(policy, kit, paths) {
  requireThat(
    exact(policy, ["schemaVersion", "kitId", "managedFiles"]) &&
      policy.schemaVersion === 1 &&
      policy.kitId === kit,
    "Invalid ownership contract",
  );
  requireThat(
    Array.isArray(policy.managedFiles) &&
      policy.managedFiles.length === paths.length,
    "Ownership must list every path",
  );
  const seen = new Set();
  for (const f of policy.managedFiles) {
    requireThat(
      exact(f, ["path", "overlayPolicy"]) &&
        f.overlayPolicy === "preserve-and-block",
      "Unsupported ownership entry",
    );
    const p = canonical_owned(f.path);
    requireThat(
      !seen.has(p.toLowerCase()) && paths.includes(p),
      "Ambiguous/mismatched ownership",
    );
    seen.add(p.toLowerCase());
  }
  requireThat(seen.size === paths.length, "Ownership paths mismatch");
}
export function check_lock(lock) {
  if (lock === null) return {};
  requireThat(
    object(lock) && validate("lock", lock).length === 0,
    "Invalid lock",
  );
  const result = {};
  for (const k of lock.kits)
    for (const [p, h] of Object.entries(k.managedFiles)) {
      canonical_owned(p);
      const key = p.toLowerCase();
      requireThat(!Object.hasOwn(result, key), "Ambiguous ownership");
      result[key] = [p, k.id, h];
    }
  return result;
}
export function plan_ownership(target, preview, metadata, policy, lock = null) {
  safeRoot(target);
  const checked = compose(preview, metadata),
    paths = checked.release.artifacts.map((f) => f.path),
    kit = checked.release.kitId;
  check_policy(policy, kit, paths);
  const previous = check_lock(lock),
    operations = [];
  for (const f of checked.release.artifacts) {
    const p = f.path,
      prior = previous[p.toLowerCase()],
      actual = inspect_target(target, p);
    let action, reason;
    if (prior && prior[1] !== kit)
      [action, reason] = ["conflict", "path already owned by another kit"];
    else if (prior && prior[0] !== p)
      [action, reason] = ["conflict", "existing lock path differs in case"];
    else if (prior && actual === null)
      [action, reason] = ["conflict", "previously managed path missing"];
    else if (prior && hash(actual) !== prior[2])
      [action, reason] = [
        "conflict",
        "local overlay differs from locked content",
      ];
    else if (actual === null) action = "create";
    else if (!prior)
      [action, reason] = [
        "conflict",
        "existing unmanaged path cannot be claimed silently",
      ];
    else if (hash(actual) === f.sha256) action = "unchanged";
    else
      [action, reason] = [
        "conflict",
        "candidate differs from installed content; update needs explicit review",
      ];
    operations.push({ path: p, action, ...(reason ? { reason } : {}) });
  }
  for (const [key, [p, owner]] of Object.entries(previous))
    if (owner === kit && !paths.some((p) => p.toLowerCase() === key))
      operations.push({
        path: p,
        action: "conflict",
        reason: "removal of previously managed path is not allowed",
      });
  operations.sort((a, b) => (a.path < b.path ? -1 : 1));
  const conflicts = operations.filter((o) => o.action === "conflict").length;
  return {
    kind: "r2d-read-only-ownership-preview",
    kitId: kit,
    status: conflicts ? "blocked" : "proposed",
    conflicts,
    operations,
    sourceProvenanceVerified: false,
    promotionAllowed: false,
    writesPerformed: false,
  };
}
if (isMain(import.meta.url))
  runMain((a) => {
    const r = plan_ownership(
      a.target,
      strictFile(a.preview, MAX_INPUT),
      strictFile(a.metadata),
      strictFile(a.policy),
      a.lock ? strictFile(a.lock) : null,
    );
    output(r);
    return r.conflicts ? 2 : 0;
  });
