import {
  fs,
  path,
  safeRoot,
  member,
  hash,
  readFile,
  strictFile,
  requireThat,
  isMain,
  runMain,
  output,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
export class PlanError extends Error {}
export const LOCK_RELATIVE = ".asf/agentkit.lock.json",
  safe_root = safeRoot,
  safe_member = member,
  file_hash = (p) => hash(readFile(p));
export function maybe_file_hash(root, p) {
  try {
    return file_hash(member(root, p));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export function load_lock(target) {
  const p = member(target, LOCK_RELATIVE);
  if (!fs.existsSync(p)) return null;
  const doc = strictFile(p);
  requireThat(!validate("lock", doc).length, "Invalid local lock");
  return doc;
}
export function status(target) {
  safeRoot(target);
  const lock = load_lock(target);
  if (!lock)
    return {
      status: "unmanaged-or-legacy",
      provenanceVerified: false,
      kits: [],
    };
  const kits = [...lock.kits]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((k) => {
      const files = Object.entries(k.managedFiles)
        .sort()
        .map(([p, digest]) => {
          const actual = maybe_file_hash(target, p);
          return {
            path: p,
            state:
              actual === null
                ? "missing"
                : actual === digest
                  ? "hash-match"
                  : "drifted",
          };
        });
      return {
        id: k.id,
        version: k.version,
        sourceCommitSha: k.sourceCommitSha,
        state: files.every((f) => f.state === "hash-match")
          ? "hash-match"
          : "drifted",
        files,
      };
    });
  return {
    status: kits.every((k) => k.state === "hash-match")
      ? "hash-match"
      : "drifted",
    provenanceVerified: false,
    kits,
  };
}
export function plan(target, source, manifest) {
  safeRoot(target);
  safeRoot(source);
  const release =
    typeof manifest === "string" ? strictFile(manifest) : manifest;
  requireThat(!validate("release", release).length, "Invalid release");
  const lock = load_lock(target),
    existing = lock?.kits.find((k) => k.id === release.kitId),
    other = new Map(
      (lock?.kits || [])
        .filter((k) => k.id !== release.kitId)
        .flatMap((k) => Object.keys(k.managedFiles).map((p) => [p, k.id])),
    ),
    candidate = {};
  for (const a of release.artifacts) {
    requireThat(a.path !== LOCK_RELATIVE, "Reserved artifact");
    requireThat(
      maybe_file_hash(source, a.path) === a.sha256,
      "Source artifact hash mismatch",
    );
    candidate[a.path] = a.sha256;
  }
  const original = existing?.managedFiles || {};
  const operations = [
    ...new Set([...Object.keys(original), ...Object.keys(candidate)]),
  ]
    .sort()
    .map((p) => {
      const desired = candidate[p],
        actual = maybe_file_hash(target, p),
        old = original[p];
      let action, reason;
      if (other.has(p))
        [action, reason] = [
          "conflict",
          "owned by another kit: " + other.get(p),
        ];
      else if (!desired)
        [action, reason] = [
          "conflict",
          "managed file absent from candidate; explicit removal not supported in R2a",
        ];
      else if (actual === null && old)
        [action, reason] = ["conflict", "previously managed file is missing"];
      else if (actual === null) action = "create";
      else if (!old) [action, reason] = ["conflict", "unmanaged existing file"];
      else if (actual !== old)
        [action, reason] = ["conflict", "local drift from locked SHA-256"];
      else action = actual === desired ? "unchanged" : "update";
      return { path: p, action, ...(reason ? { reason } : {}) };
    });
  const conflicts = operations.filter((o) => o.action === "conflict").length;
  return {
    kind: "dry-run-only",
    kitId: release.kitId,
    candidateVersion: release.kitVersion,
    sourceCommitSha: release.sourceCommitSha,
    sourceProvenanceVerified: false,
    writesPerformed: false,
    status: conflicts ? "blocked" : "proposed",
    conflicts,
    operations,
  };
}
if (isMain(import.meta.url))
  runMain((a) => {
    const result =
      a._[0] === "status"
        ? status(a.target)
        : plan(a.target, a.source, a.manifest);
    output(result);
    return result.status === "blocked" ? 2 : 0;
  });
