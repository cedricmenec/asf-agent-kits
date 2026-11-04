import {
  object,
  requireThat,
  VERSION,
  SHA,
  HEX,
  exact,
} from "./node/common.mjs";
import { validate } from "./validate_contracts.mjs";
export class TransitionPreviewError extends Error {}
const version = (v) => {
  requireThat(
    typeof v === "string" &&
      /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(v),
    "Invalid stable version",
  );
  return v.split(".").map(Number);
};
export function managedPaths(paths) {
  requireThat(
    Array.isArray(paths) && paths.length > 0 && paths.length <= 250,
    "Invalid paths",
  );
  const seen = new Set();
  const forbidden = [
    ".git",
    ".github",
    ".agents",
    ".opencode",
    "agents.md",
    "chatgpt.md",
    "opencode.json",
  ];
  for (const p of paths) {
    requireThat(
      typeof p === "string" &&
        p.length <= 320 &&
        p.startsWith(".asf/agentkit/") &&
        !/[\x00-\x1f\x7f-\uffff\\:]/.test(p) &&
        p.split("/").every((x) => x && x !== "." && x !== ".."),
      "Unsafe managed path",
    );
    const parts = p.split("/");
    requireThat(
      !parts.slice(2).some((x) => forbidden.includes(x.toLowerCase())) &&
        !parts.some(
          (x) =>
            x.toLowerCase().startsWith(".env") ||
            /\.(pem|p12|pfx|key)$/i.test(x),
        ),
      "Reserved managed path",
    );
    const key = p.toLowerCase();
    requireThat(
      !seen.has(key) &&
        ![...seen].some(
          (v) => v.startsWith(key + "/") || key.startsWith(v + "/"),
        ),
      "Colliding managed paths",
    );
    seen.add(key);
  }
  return seen;
}
export function preview_version_transition(lock, candidate, kit) {
  try {
    requireThat(
      object(lock) &&
        object(candidate) &&
        typeof kit === "string" &&
        !validate("lock", lock).length &&
        !validate("release", candidate).length,
      "Invalid contracts",
    );
    const present = lock.kits.filter((k) => k.id === kit);
    requireThat(
      present.length === 1 && candidate.kitId === kit,
      "Kit mismatch",
    );
    const installed = present[0],
      a = version(candidate.kitVersion),
      b = version(installed.version);
    requireThat(
      candidate.sourceRepository === installed.sourceRepository &&
        candidate.sourceCommitSha !== installed.sourceCommitSha &&
        installed.coreVersion === candidate.coreVersion &&
        a.some((v, i) => v > b[i] && a.slice(0, i).every((v, j) => v === b[j])),
      "Incompatible transition",
    );
    version(candidate.coreVersion);
    version(installed.coreVersion);
    const old = installed.managedFiles,
      incoming = Object.fromEntries(
        candidate.artifacts.map((a) => [a.path, a.sha256]),
      );
    managedPaths(Object.keys(old));
    managedPaths(Object.keys(incoming));
    const other = new Set(
      lock.kits
        .filter((k) => k.id !== kit)
        .flatMap((k) => Object.keys(k.managedFiles))
        .map((p) => p.toLowerCase()),
    );
    requireThat(
      !Object.keys(incoming).some((p) => other.has(p.toLowerCase())),
      "Other ownership",
    );
    requireThat(
      !Object.keys(old).some((p) =>
        Object.keys(incoming).some(
          (n) => p !== n && p.toLowerCase() === n.toLowerCase(),
        ),
      ),
      "Case rename",
    );
    const changes = [
        ...new Set([...Object.keys(old), ...Object.keys(incoming)]),
      ]
        .sort()
        .map((p) => ({
          path: p,
          action: !Object.hasOwn(incoming, p)
            ? "conflict-removal"
            : !Object.hasOwn(old, p)
              ? "propose-create"
              : old[p] === incoming[p]
                ? "unchanged"
                : "review-update",
        })),
      conflicts = changes.filter((c) => c.action === "conflict-removal").length;
    return {
      kind: "r5a02-untrusted-transition-preview",
      kitId: kit,
      fromVersion: installed.version,
      toVersion: candidate.kitVersion,
      fromCommitSha: installed.sourceCommitSha,
      toCommitSha: candidate.sourceCommitSha,
      status: conflicts ? "blocked" : "preview-only",
      conflicts,
      changes,
      independentlyVerifiedRelease: false,
      sourceProvenanceVerified: false,
      trustEvidenceIndependentlyVerified: false,
      authorizedToExecute: false,
      promotionAllowed: false,
      writesPerformed: false,
      paidApprovalRequired: true,
    };
  } catch {
    throw new TransitionPreviewError(
      "R5a-02 DENY: untrusted or incompatible version transition",
    );
  }
}
